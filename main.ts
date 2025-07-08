import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

interface HugoConverterSettings {
    gyazoAccessToken: string;
    outputDirectory: string;
}

const DEFAULT_SETTINGS: HugoConverterSettings = {
    gyazoAccessToken: '',
    outputDirectory: ''
}

interface UploadedImages {
    [key: string]: string;
}

interface GyazoResponse {
    url: string;
}

export default class HugoConverterPlugin extends Plugin {
    settings: HugoConverterSettings;

    async onload() {
        await this.loadSettings();

        // エディタ右クリックメニューに追加
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                menu.addItem((item) => {
                    item
                        .setTitle('Hugoブログに変換')
                        .setIcon('paper-plane')
                        .onClick(async () => {
                            await this.convertToHugo(view.file);
                        });
                });
            })
        );

        // ファイルメニューに追加
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item
                            .setTitle('Hugoブログに変換')
                            .setIcon('paper-plane')
                            .onClick(async () => {
                                await this.convertToHugo(file);
                            });
                    });
                }
            })
        );

        // コマンドパレットに追加
        this.addCommand({
            id: 'convert-to-hugo',
            name: 'Hugoブログに変換',
            editorCallback: async (editor: Editor, view: MarkdownView) => {
                await this.convertToHugo(view.file);
            }
        });

        this.addSettingTab(new HugoConverterSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async convertToHugo(file: TFile | null) {
        if (!file) {
            new Notice('ファイルが選択されていません');
            return;
        }

        try {
            // ファイル内容を読み込み
            const content = await this.app.vault.read(file);
            
            // 既存のfrontmatterから初回変換日を取得
            const existingFirstConverted = this.extractFirstConvertedDate(content);
            const firstConvertedDate = existingFirstConverted || new Date();
            
            new Notice('画像のアップロードを開始します...');
            
            // 画像をGyazoにアップロード（完全に終わるまで待つ）
            const uploadedImages = await this.uploadImagesToGyazo(content);
            
            // アップロードが完了したら元の記事を更新
            let updatedContent = content;
            if (Object.keys(uploadedImages).length > 0) {
                new Notice('元の記事を更新中...');
                await this.updateOriginalFile(file, uploadedImages);
                
                // 更新が完了してから再読み込み
                updatedContent = await this.app.vault.read(file);
                new Notice('記事の更新が完了しました');
            }
            
            // 初回変換日をfrontmatterに追加（まだない場合）
            if (!existingFirstConverted) {
                updatedContent = await this.addFirstConvertedToFrontmatter(file, updatedContent, firstConvertedDate);
            }
            
            // すべての更新が完了してから変換処理を開始
            new Notice('Hugo形式に変換中...');
            const converted = await this.convertContent(updatedContent, file.basename, firstConvertedDate);
            
            // 日付とスラッグを生成（初回変換日を使用）
            const dateStr = firstConvertedDate.toISOString().slice(0, 10).replace(/-/g, '');
            const slug = this.generateSlug(file.basename);
            const filename = `${dateStr}01-${slug}.md`;
            
            // 出力先ディレクトリが設定されている場合はそこに保存
            if (this.settings.outputDirectory) {
                await this.saveToDirectory(converted, filename);
            } else {
                // ダウンロードフォルダに保存
                const blob = new Blob([converted], { type: 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                new Notice(`変換完了: ${filename} (ダウンロード)`);
            }
        } catch (error) {
            console.error('変換エラー:', error);
            new Notice('変換中にエラーが発生しました');
        }
    }

    extractFirstConvertedDate(content: string): Date | null {
        // frontmatterを解析
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!frontmatterMatch) return null;
        
        const frontmatter = frontmatterMatch[1];
        const firstConvertedMatch = frontmatter.match(/first_converted:\s*(.+)/);
        
        if (firstConvertedMatch) {
            const dateStr = firstConvertedMatch[1].trim();
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date;
        }
        
        return null;
    }

    async addFirstConvertedToFrontmatter(file: TFile, content: string, date: Date): Promise<string> {
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        
        if (frontmatterMatch) {
            // 既存のfrontmatterに追加
            const frontmatter = frontmatterMatch[1];
            const newFrontmatter = `---\n${frontmatter}\nfirst_converted: ${date.toISOString()}\n---`;
            const newContent = content.replace(/^---\n[\s\S]*?\n---/, newFrontmatter);
            await this.app.vault.modify(file, newContent);
            return newContent;
        } else {
            // frontmatterがない場合は新規作成
            const newContent = `---\nfirst_converted: ${date.toISOString()}\n---\n\n${content}`;
            await this.app.vault.modify(file, newContent);
            return newContent;
        }
    }

    async uploadImagesToGyazo(content: string): Promise<UploadedImages> {
        if (!this.settings.gyazoAccessToken) {
            new Notice('Gyazoアクセストークンが設定されていません');
            return {};
        }

        // 標準的なMarkdown画像とObsidian形式の画像の両方を検出
        const standardImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const obsidianImageRegex = /!\[\[([^\]]+)\]\]/g;
        
        const standardMatches = [...content.matchAll(standardImageRegex)];
        const obsidianMatches = [...content.matchAll(obsidianImageRegex)];
        const uploadedImages: UploadedImages = {};

        // 標準的なMarkdown画像を処理
        for (const match of standardMatches) {
            const imagePath = match[2];
            
            // 外部URLの場合はスキップ
            if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
                continue;
            }

            try {
                // Obsidianの画像ファイルを取得
                const normalizedPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                const imageFile = this.app.vault.getAbstractFileByPath(normalizedPath);
                
                if (imageFile instanceof TFile) {
                    // ファイルを読み込み
                    const arrayBuffer = await this.app.vault.readBinary(imageFile);
                    const blob = new Blob([arrayBuffer], { type: `image/${imageFile.extension}` });
                    
                    // Gyazoにアップロード
                    const formData = new FormData();
                    formData.append('imagedata', blob);
                    formData.append('access_token', this.settings.gyazoAccessToken);
                    
                    const response = await fetch('https://upload.gyazo.com/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json() as GyazoResponse;
                        uploadedImages[imagePath] = data.url;
                        new Notice(`画像アップロード完了: ${imageFile.name}`);
                    } else {
                        console.error('Gyazoアップロードエラー:', response.statusText);
                    }
                }
            } catch (error) {
                console.error('画像処理エラー:', error);
            }
        }

        // Obsidian形式の画像を処理
        for (const match of obsidianMatches) {
            const imageName = match[1];
            
            try {
                // 画像ファイルを検索（imagesフォルダや添付ファイルフォルダを確認）
                const possiblePaths = [
                    `images/${imageName}`,
                    imageName,
                    `${imageName}`
                ];
                
                let imageFile: TFile | null = null;
                for (const path of possiblePaths) {
                    const file = this.app.vault.getAbstractFileByPath(path);
                    if (file instanceof TFile) {
                        imageFile = file;
                        break;
                    }
                }
                
                if (imageFile) {
                    // ファイルを読み込み
                    const arrayBuffer = await this.app.vault.readBinary(imageFile);
                    const blob = new Blob([arrayBuffer], { type: `image/${imageFile.extension}` });
                    
                    // Gyazoにアップロード
                    const formData = new FormData();
                    formData.append('imagedata', blob);
                    formData.append('access_token', this.settings.gyazoAccessToken);
                    
                    const response = await fetch('https://upload.gyazo.com/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    
                    if (response.ok) {
                        const data = await response.json() as GyazoResponse;
                        uploadedImages[`![[${imageName}]]`] = data.url;
                        new Notice(`画像アップロード完了: ${imageFile.name}`);
                    } else {
                        console.error('Gyazoアップロードエラー:', response.statusText);
                    }
                } else {
                    console.error('画像ファイルが見つかりません:', imageName);
                }
            } catch (error) {
                console.error('画像処理エラー:', error);
            }
        }

        return uploadedImages;
    }

    async updateOriginalFile(file: TFile, uploadedImages: UploadedImages) {
        try {
            let content = await this.app.vault.read(file);
            let updated = false;
            
            // Obsidian形式の画像を置換
            for (const [oldPath, newUrl] of Object.entries(uploadedImages)) {
                if (oldPath.startsWith('![[')) {
                    // Obsidian形式の画像
                    const newContent = content.replace(oldPath, `![image](${newUrl})`);
                    if (newContent !== content) {
                        content = newContent;
                        updated = true;
                    }
                } else {
                    // 標準Markdown形式の画像
                    const regex = new RegExp(`!\\[([^\\]]*)\\]\\(${oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
                    const newContent = content.replace(regex, `![$1](${newUrl})`);
                    if (newContent !== content) {
                        content = newContent;
                        updated = true;
                    }
                }
            }
            
            if (updated) {
                await this.app.vault.modify(file, content);
                new Notice('元の記事の画像URLを更新しました');
            }
        } catch (error) {
            console.error('元ファイルの更新エラー:', error);
            new Notice('元ファイルの更新に失敗しました');
        }
    }

    convertContent(content: string, filename: string, firstConvertedDate: Date): string {
        // タグを抽出
        const tagMatches = content.match(/^#\w+(\s+#\w+)*/m);
        const tags = tagMatches ? tagMatches[0].split(/\s+/).map(tag => tag.substring(1)) : [];
        
        // タグ行を削除
        let cleanContent = content;
        if (tagMatches) {
            cleanContent = content.replace(/^#\w+(\s+#\w+)*\s*\n*/m, '');
        }
        
        // first_convertedを含むfrontmatterを削除
        cleanContent = cleanContent.replace(/^---\n[\s\S]*?\n---\n*/m, '');
        
        // タイトルを取得（最初の#見出しまたはファイル名）
        const titleMatch = cleanContent.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : filename.replace(/\.md$/, '');
        
        // 内部リンクを変換
        cleanContent = cleanContent.replace(/\[\[([^\]]+)\]\]/g, (match, p1) => {
            // 単純にリンクテキストとして表示
            return p1;
        });
        
        // この時点で画像はすでにGyazo URLに置換されているので、特別な処理は不要
        
        // frontmatterを生成（初回変換日を使用）
        const frontmatter = `---
title: "${title}"
date: ${firstConvertedDate.toISOString()}
slug: ${this.generateSlug(filename)}
tags:${tags.length > 0 ? '\n' + tags.map(tag => `  - ${tag}`).join('\n') : ' []'}
draft: false
---`;
        
        return `${frontmatter}\n\n${cleanContent}`;
    }

    generateSlug(filename: string): string {
        // ファイル名からスラッグを生成
        return filename
            .replace(/\.md$/, '')
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // 特殊文字を削除
            .replace(/\s+/g, '-') // スペースをハイフンに
            .replace(/-+/g, '-') // 連続ハイフンを1つに
            .trim();
    }

    async saveToDirectory(content: string, filename: string) {
        try {
            // Node.jsのファイルシステムAPIを使用
            const fs = require('fs').promises;
            const path = require('path');
            
            // 出力先ディレクトリが存在するか確認
            try {
                await fs.access(this.settings.outputDirectory);
            } catch {
                // ディレクトリが存在しない場合は作成
                await fs.mkdir(this.settings.outputDirectory, { recursive: true });
            }
            
            // ファイルパスを構築
            const filePath = path.join(this.settings.outputDirectory, filename);
            
            // ファイルを書き込み
            await fs.writeFile(filePath, content, 'utf8');
            
            new Notice(`変換完了: ${filename} → ${filePath}`);
        } catch (error) {
            console.error('ファイル保存エラー:', error);
            
            // エラーが発生した場合は、Obsidian APIを使用して保存を試みる
            try {
                // Obsidianのファイルシステムを使用
                const adapter = this.app.vault.adapter;
                if (adapter && 'fs' in adapter) {
                    const fs = (adapter as any).fs;
                    const path = require('path');
                    
                    // ディレクトリの存在確認と作成
                    if (!await adapter.exists(this.settings.outputDirectory)) {
                        await adapter.mkdir(this.settings.outputDirectory);
                    }
                    
                    // ファイルパスを構築
                    const filePath = path.join(this.settings.outputDirectory, filename);
                    
                    // ファイルを書き込み
                    await adapter.write(filePath, content);
                    
                    new Notice(`変換完了: ${filename} → ${filePath}`);
                } else {
                    throw new Error('ファイルシステムにアクセスできません');
                }
            } catch (fallbackError) {
                console.error('代替保存方法も失敗:', fallbackError);
                new Notice('ファイルの保存に失敗しました。ディレクトリパスを確認してください。');
            }
        }
    }
}

class HugoConverterSettingTab extends PluginSettingTab {
    plugin: HugoConverterPlugin;

    constructor(app: App, plugin: HugoConverterPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        containerEl.createEl('h2', {text: 'Hugo Converter 設定'});

        new Setting(containerEl)
            .setName('Gyazo アクセストークン')
            .setDesc('Gyazo APIのアクセストークンを入力してください。')
            .addText(text => text
                .setPlaceholder('アクセストークンを入力')
                .setValue(this.plugin.settings.gyazoAccessToken)
                .onChange(async (value) => {
                    this.plugin.settings.gyazoAccessToken = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('p', {
            text: 'Gyazoアクセストークンの取得方法：',
            cls: 'setting-item-description'
        });
        
        const ol = containerEl.createEl('ol', {
            cls: 'setting-item-description'
        });
        ol.createEl('li', {text: 'https://gyazo.com/oauth/applications にアクセス'});
        ol.createEl('li', {text: '「新しいアプリケーションを登録」をクリック'});
        ol.createEl('li', {text: 'アプリケーション名を入力して登録'});
        ol.createEl('li', {text: '生成されたアクセストークンをコピー'});

        containerEl.createEl('br');

        new Setting(containerEl)
            .setName('出力先ディレクトリ')
            .setDesc('変換したファイルの保存先ディレクトリを指定してください。空の場合はダウンロードになります。')
            .addText(text => text
                .setPlaceholder('例: /Users/username/Documents/hugo-blog')
                .setValue(this.plugin.settings.outputDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.outputDirectory = value;
                    await this.plugin.saveSettings();
                }));
    }
}