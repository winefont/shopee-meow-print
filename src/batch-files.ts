export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;
export const MAX_BATCH_FILES = 20;

export function pdfSelectionIssues(files: readonly Pick<File, 'name' | 'size'>[]): string[] {
  const issues: string[] = [];
  if (files.length > MAX_BATCH_FILES) issues.push(`一批最多 ${MAX_BATCH_FILES} 份 PDF，請分批處理。`);
  for (const file of files) if (!file.name.toLowerCase().endsWith('.pdf') || !file.size || file.size > MAX_FILE_BYTES) {
    issues.push(`「${file.name}」不是有效 PDF，或超過單檔 30 MB。`);
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) issues.push('整批檔案合計最多 100 MB，請分批處理。');
  return issues;
}
