using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

// .NET Framework / Windows 10+; no separately installed .NET runtime is needed.
internal sealed class SetupOptions
{
    public bool Silent, NoRegistry, NoLaunch, NoBrowser;
    public string InstallDirectory = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "ShippingWorkbench");
    public string ShortcutDirectory;
    public string LogFile = Path.Combine(Path.GetTempPath(),
        "ShopeeMeowPrint-Setup-" + DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" +
        Guid.NewGuid().ToString("N").Substring(0, 8) + ".log");

    public static SetupOptions Parse(string[] args)
    {
        var result = new SetupOptions();
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--silent": result.Silent = true; break;
                case "--no-registry": result.NoRegistry = true; break;
                case "--no-launch": result.NoLaunch = true; break;
                case "--no-browser": result.NoBrowser = true; break;
                case "--install-dir": result.InstallDirectory = Next(args, ref i); break;
                case "--shortcut-dir": result.ShortcutDirectory = Next(args, ref i); break;
                case "--log": result.LogFile = Next(args, ref i); break;
                default: throw new ArgumentException("Unknown setup option: " + args[i]);
            }
        }
        result.InstallDirectory = Path.GetFullPath(result.InstallDirectory);
        result.LogFile = Path.GetFullPath(result.LogFile);
        if (result.ShortcutDirectory != null)
            result.ShortcutDirectory = Path.GetFullPath(result.ShortcutDirectory);
        return result;
    }
    private static string Next(string[] args, ref int i)
    {
        if (++i >= args.Length || args[i].StartsWith("--"))
            throw new ArgumentException("A setup option is missing its path.");
        return args[i];
    }
}

internal sealed class SetupResult
{
    public int ExitCode;
    public string Message;
}

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        SetupOptions options;
        try { options = SetupOptions.Parse(args); }
        catch (Exception error)
        {
            if (Array.IndexOf(args, "--silent") < 0)
                MessageBox.Show(error.Message, "蝦皮印單喵", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        bool acquired = false;
        using (var mutex = new Mutex(false, @"Local\ShopeeMeowPrint-Setup"))
        {
            try
            {
                try { acquired = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired)
                {
                    if (!options.Silent)
                        MessageBox.Show("安裝程式已在執行，請等待目前的安裝完成。", "蝦皮印單喵");
                    return 1;
                }
                if (options.Silent) return Install(options, delegate { }).ExitCode;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var form = new SetupWindow(options))
                {
                    Application.Run(form);
                    return form.ResultCode;
                }
            }
            finally { if (acquired) mutex.ReleaseMutex(); }
        }
    }

    public static SetupResult Install(SetupOptions options, Action<string> status)
    {
        string temporary = Path.Combine(Path.GetTempPath(),
            "ShopeeMeowPrint-Setup-" + Guid.NewGuid().ToString("N"));
        bool installed = false;
        try
        {
            if (!Environment.Is64BitOperatingSystem)
                throw new InvalidOperationException("此版本需要 Windows 10/11 64 位元。");
            Directory.CreateDirectory(Path.GetDirectoryName(options.LogFile));
            File.WriteAllText(options.LogFile, "Shopee Meow Print setup " + SetupBuild.Version +
                Environment.NewLine + "Destination: " + options.InstallDirectory +
                Environment.NewLine + "Temporary files: " + temporary + Environment.NewLine, Encoding.UTF8);
            status("正在驗證安裝包…");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("ShopeeMeowPrint.Package.zip"))
            {
                if (resource == null) throw new InvalidDataException("找不到安裝內容。");
                string checksum;
                using (var hash = SHA256.Create())
                    checksum = BitConverter.ToString(hash.ComputeHash(resource)).Replace("-", "").ToLowerInvariant();
                if (checksum != SetupBuild.PackageSha256)
                    throw new InvalidDataException("安裝包校驗失敗，請重新取得完整的 EXE。");
                resource.Position = 0;
                Directory.CreateDirectory(temporary);
                status("正在準備程式與離線資源…");
                using (var archive = new ZipArchive(resource, ZipArchiveMode.Read))
                {
                    var destinations = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    long totalSize = 0;
                    if (archive.Entries.Count > 3000) throw new InvalidDataException("Unexpected package contents.");
                    foreach (var entry in archive.Entries)
                    {
                        totalSize += entry.Length;
                        if (totalSize > 512L * 1024 * 1024 ||
                            !entry.FullName.StartsWith(SetupBuild.PackageName + "/", StringComparison.Ordinal) ||
                            entry.FullName.Contains(":") || entry.FullName.Contains("\\"))
                            throw new InvalidDataException("Invalid package path or size.");
                        string destination = Path.GetFullPath(Path.Combine(temporary, entry.FullName.Replace('/', '\\')));
                        if (!destination.StartsWith(temporary + "\\", StringComparison.OrdinalIgnoreCase) ||
                            !destinations.Add(destination))
                            throw new InvalidDataException("Invalid or repeated package path.");
                        if (entry.FullName.EndsWith("/")) { Directory.CreateDirectory(destination); continue; }
                        Directory.CreateDirectory(Path.GetDirectoryName(destination));
                        using (Stream input = entry.Open())
                        using (var output = new FileStream(destination, FileMode.CreateNew, FileAccess.Write))
                            input.CopyTo(output);
                    }
                }
            }
            string packageRoot = Path.Combine(temporary, SetupBuild.PackageName);
            status("正在安裝並建立桌面捷徑…");
            var installArgs = new List<string> {
                "-InstallDirectory", options.InstallDirectory, "-NoStart", "-NonInteractive"
            };
            if (options.ShortcutDirectory != null)
                installArgs.AddRange(new[] { "-ShortcutDirectory", options.ShortcutDirectory });
            if (options.NoRegistry) installArgs.Add("-NoRegistry");
            int installCode = RunPowerShell(Path.Combine(packageRoot, "install.ps1"), installArgs, options.LogFile, temporary);
            if (installCode != 0) throw new InvalidOperationException("安裝未完成，請保留記錄檔以便檢查。");
            installed = true;
            if (!options.NoLaunch)
            {
                status("正在啟動蝦皮印單喵…");
                var launchArgs = new List<string>();
                if (options.NoBrowser) launchArgs.Add("-NoBrowser");
                int launchCode = RunPowerShell(Path.Combine(options.InstallDirectory, "scripts", "start.ps1"),
                    launchArgs, options.LogFile, temporary);
                if (launchCode != 0)
                    return new SetupResult { ExitCode = 2, Message =
                        "安裝已完成，桌面捷徑已建立，但這次未能啟動。\r\n請稍後雙擊桌面的「蝦皮印單喵」再試一次。\r\n\r\n記錄檔：\r\n" + options.LogFile };
            }
            return new SetupResult { ExitCode = 0, Message =
                "安裝完成！\r\n以後雙擊桌面的「蝦皮印單喵」即可使用。\r\n\r\nXP-420B 列印設定：100 × 150 mm、實際大小 100%。" };
        }
        catch (Exception error)
        {
            try { File.AppendAllText(options.LogFile, error + Environment.NewLine, Encoding.UTF8); } catch { }
            return new SetupResult { ExitCode = installed ? 2 : 1, Message =
                (installed ? "安裝已完成，但啟動未完成。" : "安裝未完成。") +
                "\r\n" + error.Message + "\r\n\r\n記錄檔：\r\n" + options.LogFile };
        }
        finally
        {
            // Only remove this invocation's randomly named temporary directory.
            try
            {
                string resolved = Path.GetFullPath(temporary).TrimEnd('\\');
                string tempRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\') + "\\";
                if (resolved.StartsWith(tempRoot + "ShopeeMeowPrint-Setup-", StringComparison.OrdinalIgnoreCase) &&
                    Path.GetDirectoryName(resolved).TrimEnd('\\') == tempRoot.TrimEnd('\\') &&
                    Directory.Exists(resolved))
                    DeleteOwnedTemporaryDirectory(resolved);
                File.AppendAllText(options.LogFile, "Temporary package removed." + Environment.NewLine, Encoding.UTF8);
            }
            catch (Exception error)
            {
                try { File.AppendAllText(options.LogFile, "Temporary cleanup: " + error.Message + Environment.NewLine, Encoding.UTF8); } catch { }
            }
        }
    }

    private static void DeleteOwnedTemporaryDirectory(string directory)
    {
        if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0)
            throw new IOException("Temporary directory is a link; it was kept.");
        foreach (string child in Directory.GetFileSystemEntries(directory))
        {
            var attributes = File.GetAttributes(child);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("Temporary content contains a link; it was kept.");
            if ((attributes & FileAttributes.Directory) != 0) DeleteOwnedTemporaryDirectory(child);
            else File.Delete(child);
        }
        Directory.Delete(directory);
    }

    private static int RunPowerShell(string script, List<string> arguments, string log, string temporary)
    {
        string executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell", "v1.0", "powershell.exe");
        string runner = Path.Combine(temporary, "run-" + Guid.NewGuid().ToString("N") + ".ps1");
        string stepLog = runner + ".log";
        var wrapper = new StringBuilder("$ErrorActionPreference = 'Stop'\r\n$global:LASTEXITCODE = 0\r\n$invokeParameters = @{\r\n");
        for (int i = 0; i < arguments.Count; i++)
        {
            string name = arguments[i].TrimStart('-');
            string value = "$true";
            if (i + 1 < arguments.Count && !arguments[i + 1].StartsWith("-"))
                value = PowerShellLiteral(arguments[++i]);
            wrapper.Append(PowerShellLiteral(name)).Append(" = ").Append(value).Append("\r\n");
        }
        wrapper.Append("}\r\ntry {\r\n & ").Append(PowerShellLiteral(script))
            .Append(" @invokeParameters *> ").Append(PowerShellLiteral(stepLog))
            .Append("\r\n if (-not $? -and $LASTEXITCODE -eq 0) { exit 1 }\r\n exit $LASTEXITCODE\r\n")
            .Append("} catch { $_ | Out-File -LiteralPath ").Append(PowerShellLiteral(stepLog))
            .Append(" -Append; exit 1 }\r\n");
        File.WriteAllText(runner, wrapper.ToString(), new UTF8Encoding(true));
        var allArgs = new List<string> { "-NoLogo", "-NoProfile", "-NonInteractive",
            "-ExecutionPolicy", "Bypass", "-File", runner };
        var quoted = new List<string>();
        foreach (string value in allArgs) quoted.Add(QuoteArgument(value));
        var info = new ProcessStartInfo(executable, string.Join(" ", quoted.ToArray())) {
            UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden,
            WorkingDirectory = Path.GetDirectoryName(script)
        };
        // Launching setup from PowerShell 7 can otherwise make Windows PowerShell
        // import incompatible modules inherited via PSModulePath.
        info.EnvironmentVariables["PSModulePath"] = Path.Combine(Path.GetDirectoryName(executable), "Modules");
        using (var process = Process.Start(info))
        {
            // Redirect inside PowerShell to a file, not inherited anonymous pipes:
            // the detached Node server must not keep setup waiting for pipe EOF.
            process.WaitForExit();
            string output = File.Exists(stepLog) ? File.ReadAllText(stepLog) : "";
            File.AppendAllText(log, output +
                "Exit code: " + process.ExitCode + Environment.NewLine, Encoding.UTF8);
            return process.ExitCode;
        }
    }

    private static string PowerShellLiteral(string value) { return "'" + value.Replace("'", "''") + "'"; }

    // Quote Windows argv, including trailing backslashes and embedded quotes.
    private static string QuoteArgument(string value)
    {
        var output = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') { output.Append('\\', slashes * 2 + 1); output.Append('"'); }
            else { output.Append('\\', slashes); output.Append(character); }
            slashes = 0;
        }
        output.Append('\\', slashes * 2);
        return output.Append('"').ToString();
    }
}

internal sealed class SetupWindow : Form
{
    private readonly SetupOptions options;
    private readonly Label title = new Label(), message = new Label();
    private readonly ProgressBar progress = new ProgressBar();
    private readonly Button finish = new Button();
    private bool completed;
    public int ResultCode = 1;

    public SetupWindow(SetupOptions options)
    {
        this.options = options;
        Text = "蝦皮印單喵 — 安裝 " + SetupBuild.Version;
        Font = new Font("Microsoft JhengHei UI", 11);
        ClientSize = new Size(600, 350);
        AutoScaleMode = AutoScaleMode.Dpi;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(255, 250, 246);
        Icon = Icon.ExtractAssociatedIcon(Assembly.GetExecutingAssembly().Location);
        Image pawImage = Icon.ToBitmap();
        using (var brandStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("ShopeeMeowPrint.BrandIcon.png"))
        {
            if (brandStream != null)
                using (var original = Image.FromStream(brandStream))
                { pawImage.Dispose(); pawImage = new Bitmap(original); }
        }
        var paw = new PictureBox { Image = pawImage, SizeMode = PictureBoxSizeMode.Zoom };
        paw.SetBounds(28, 18, 76, 76);
        Controls.Add(paw);
        title.SetBounds(120, 32, 450, 38);
        title.Text = "正在安裝 蝦皮印單喵";
        title.Font = new Font(Font.FontFamily, 17, FontStyle.Bold);
        title.ForeColor = Color.FromArgb(23, 107, 83);
        message.SetBounds(30, 100, 540, 145);
        message.Text = "安裝後將建立桌面捷徑，並自動開啟工具。";
        progress.SetBounds(30, 260, 540, 8);
        progress.Style = ProgressBarStyle.Marquee;
        finish.SetBounds(460, 290, 110, 36);
        finish.Text = "完成";
        finish.Enabled = false;
        finish.Click += delegate { Close(); };
        Controls.AddRange(new Control[] { title, message, progress, finish });
        Shown += Run;
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (!completed) e.Cancel = true; };
    }

    private async void Run(object sender, EventArgs e)
    {
        SetupResult result = await Task.Run(() => Program.Install(options, status =>
            BeginInvoke(new Action(() => message.Text = status))));
        ResultCode = result.ExitCode;
        completed = true;
        title.Text = result.ExitCode == 0 ? "安裝完成" :
            result.ExitCode == 2 ? "已安裝，啟動需要再試一次" : "安裝未完成";
        message.Text = result.Message;
        if (result.ExitCode != 0) title.ForeColor = Color.FromArgb(145, 68, 25);
        progress.Style = ProgressBarStyle.Blocks;
        progress.Value = 100;
        finish.Enabled = true;
        AcceptButton = finish;
        finish.Focus();
    }
}
