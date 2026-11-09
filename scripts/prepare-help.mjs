import { copyFile } from 'node:fs/promises';

// One guide source for the app, offline cache and installer.
await copyFile(new URL('../installer/public-guide.html', import.meta.url), new URL('../public/help.html', import.meta.url));
