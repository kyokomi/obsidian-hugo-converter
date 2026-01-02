
// Jest用の 'obsidian' モック

export class Plugin {
    constructor(app: any, manifest: any) {}
}

export class Notice {
    constructor(message: string) {}
}

export class PluginSettingTab {
    constructor(app: any, plugin: any) {}
}

export class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
}

// テストで使うその他のクラスや関数をモック
export const Editor = jest.fn();
export const MarkdownView = jest.fn();
export const requestUrl = jest.fn();
export const FileSystemAdapter = jest.fn();

// TFileのような、インスタンスを返す必要があるものをモック
export const TFile = {
    extension: 'md',
    basename: 'test-file',
};
