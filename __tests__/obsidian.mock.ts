
// Jest用の 'obsidian' モック

export class Plugin {
    app: any;
    manifest: any;
    constructor(app: any, manifest: any) {
        this.app = app;
        this.manifest = manifest;
    }
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

// TFile（instanceof で判定されるためクラスとして定義）
export class TFile {
    path: string;
    name: string;
    basename: string;
    extension: string;
    constructor(path = 'test-file.md') {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
        const dot = this.name.lastIndexOf('.');
        this.basename = dot >= 0 ? this.name.slice(0, dot) : this.name;
        this.extension = dot >= 0 ? this.name.slice(dot + 1) : '';
    }
}
