import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, requestUrl, FileSystemAdapter } from 'obsidian';

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
            name: 'Convert to Hugo blog',
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
            new Notice('No file selected');
            return;
        }

        try {
            // ファイル内容を読み込み
            const content = await this.app.vault.read(file);

            // 既存のfrontmatterから初回変換日を取得
            const existingFirstConverted = this.extractFirstConvertedDate(content);
            const firstConvertedDate = existingFirstConverted || new Date();

            new Notice('Converting to Hugo format...');
            
            // 画像をGyazoにアップロード（完全に終わるまで待つ）
            const uploadedImages = await this.uploadImagesInContent(content);

            // アップロードが完了したら元の記事を更新
            let updatedContent = content;
            if (Object.keys(uploadedImages).length > 0) {
                await this.updateOriginalFile(file, uploadedImages);

                // 更新が完了してから再読み込み
                updatedContent = await this.app.vault.read(file);
            }

            // 初回変換日をfrontmatterに追加（まだない場合）
            if (!existingFirstConverted) {
                updatedContent = await this.addFirstConvertedToFrontmatter(file, updatedContent, firstConvertedDate);
            }

            // すべての更新が完了してから変換処理を開始
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
                new Notice(`Conversion complete: ${filename} (download)`);
            }
        } catch (error) {
            console.error('変換エラー:', error);
            new Notice('An error occurred during conversion');
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

    async uploadImageToGyazo(imageFile: TFile): Promise<string | null> {
        try {
            // ファイルを読み込み
            const arrayBuffer = await this.app.vault.readBinary(imageFile);

            // multipart/form-dataを手動で作成
            const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
            const encoder = new TextEncoder();

            // 各パートを作成
            const parts: ArrayBuffer[] = [];

            // access_tokenパート
            const tokenPart = `------${boundary}\r\nContent-Disposition: form-data; name="access_token"\r\n\r\n${this.settings.gyazoAccessToken}\r\n`;
            parts.push(encoder.encode(tokenPart).buffer);

            // imagedataパート
            const imageHeader = `------${boundary}\r\nContent-Disposition: form-data; name="imagedata"; filename="${imageFile.name}"\r\nContent-Type: image/${imageFile.extension}\r\n\r\n`;
            parts.push(encoder.encode(imageHeader).buffer);
            parts.push(arrayBuffer);
            parts.push(encoder.encode('\r\n').buffer);

            // 終端
            const footer = `------${boundary}--\r\n`;
            parts.push(encoder.encode(footer).buffer);

            // すべてのパートを結合
            const totalLength = parts.reduce((acc, part) => acc + part.byteLength, 0);
            const body = new Uint8Array(totalLength);
            let offset = 0;
            for (const part of parts) {
                body.set(new Uint8Array(part), offset);
                offset += part.byteLength;
            }

            const response = await requestUrl({
                url: 'https://upload.gyazo.com/api/upload',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=----${boundary}`
                },
                body: body.buffer
            });

            if (response.status === 200) {
                const data = response.json as GyazoResponse;
                // 画像アップロード完了（通知削除）
                return data.url;
            } else {
                console.error('Gyazoアップロードエラー:', response.status);
                return null;
            }
        } catch (error) {
            console.error('画像処理エラー:', error);
            return null;
        }
    }

    createProgressNotice(current: number, total: number, message: string): Notice {
        const percentage = Math.round((current / total) * 100);
        const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
        const noticeText = `${message} [${progressBar}] ${current}/${total} (${percentage}%)`;
        return new Notice(noticeText, 0); // 0 = 自動で消えない
    }

    async uploadImagesInContent(content: string): Promise<UploadedImages> {
        if (!this.settings.gyazoAccessToken) {
            new Notice('Gyazo access token is not configured');
            return {};
        }

        // 標準的なMarkdown画像とObsidian形式の画像の両方を検出
        const standardImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const obsidianImageRegex = /!\[\[([^\]]+)\]\]/g;

        const standardMatches = [...content.matchAll(standardImageRegex)];
        const obsidianMatches = [...content.matchAll(obsidianImageRegex)];
        const uploadedImages: UploadedImages = {};

        // 処理対象の画像をフィルタリング（外部URLを除外）
        const filteredStandardMatches = standardMatches.filter(match => {
            const imagePath = match[2];
            return !imagePath.startsWith('http://') && !imagePath.startsWith('https://');
        });

        const totalImages = filteredStandardMatches.length + obsidianMatches.length;
        
        if (totalImages === 0) {
            // 画像がない場合は静かに処理を続行
            return {};
        }

        let currentCount = 0;
        let progressNotice = this.createProgressNotice(currentCount, totalImages, 'Uploading images');

        // 標準的なMarkdown画像を処理
        for (const match of filteredStandardMatches) {
            const imagePath = match[2];

            try {
                // Obsidianの画像ファイルを取得
                const normalizedPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                const imageFile = this.app.vault.getAbstractFileByPath(normalizedPath);

                if (imageFile instanceof TFile) {
                    const uploadedUrl = await this.uploadImageToGyazo(imageFile);
                    if (uploadedUrl) {
                        uploadedImages[imagePath] = uploadedUrl;
                    }
                }
            } catch (error) {
                console.error('画像処理エラー:', error);
            }

            // プログレスバーを更新
            currentCount++;
            progressNotice.hide();
            progressNotice = this.createProgressNotice(currentCount, totalImages, 'Uploading images');
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
                    const uploadedUrl = await this.uploadImageToGyazo(imageFile);
                    if (uploadedUrl) {
                        uploadedImages[`![[${imageName}]]`] = uploadedUrl;
                    }
                } else {
                    console.error('画像ファイルが見つかりません:', imageName);
                }
            } catch (error) {
                console.error('画像処理エラー:', error);
            }

            // プログレスバーを更新
            currentCount++;
            progressNotice.hide();
            progressNotice = this.createProgressNotice(currentCount, totalImages, 'Uploading images');
        }

        // 完了通知
        progressNotice.hide();
        // 画像アップロード完了（通知削除）

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
                // 画像URL更新完了（通知削除）
            }
        } catch (error) {
            console.error('元ファイルの更新エラー:', error);
            new Notice('Failed to update original file');
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
            const adapter = this.app.vault.adapter;

            // FileSystemAdapterの場合のみ処理を続行
            if (adapter instanceof FileSystemAdapter) {
                const outputDir = this.settings.outputDirectory;
                // @ts-ignore: require is available in Obsidian environment
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const fs = require('fs');
                // @ts-ignore: require is available in Obsidian environment
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const nodePath = require('path');

                // 絶対パスに変換
                const absoluteOutputDir = nodePath.isAbsolute(outputDir)
                    ? outputDir
                    : nodePath.join(adapter.getBasePath(), outputDir);

                // ディレクトリの存在確認と作成
                if (!fs.existsSync(absoluteOutputDir)) {
                    fs.mkdirSync(absoluteOutputDir, { recursive: true });
                }

                // ファイルパスを構築
                const filePath = nodePath.join(absoluteOutputDir, filename);

                // ファイルを書き込み
                fs.writeFileSync(filePath, content, 'utf8');

                new Notice(`Conversion complete: ${filename} → ${filePath}`);
            } else {
                // FileSystemAdapterが利用できない場合はエラー
                new Notice('Error: External directory writing is not supported in this environment');
                throw new Error('FileSystemAdapter is not available');
            }
        } catch (error) {
            console.error('ファイル保存エラー:', error);
            new Notice('Failed to save file. Please check the directory path.');
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

        containerEl.createEl('h2', {text: 'Hugo Converter Settings'});

        new Setting(containerEl)
            .setName('Gyazo Access Token')
            .setDesc('Upload images in the article to Gyazo API and replace URLs.')
            .addText(text => text
                .setPlaceholder('Enter access token')
                .setValue(this.plugin.settings.gyazoAccessToken)
                .onChange(async (value) => {
                    this.plugin.settings.gyazoAccessToken = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('p', {
            text: 'How to get Gyazo access token:',
            cls: 'setting-item-description'
        });

        const ol = containerEl.createEl('ol', {
            cls: 'setting-item-description'
        });
        ol.createEl('li', {text: 'Visit https://gyazo.com/oauth/applications'});
        ol.createEl('li', {text: 'Click "Register new application"'});
        ol.createEl('li', {text: 'Enter application name and register'});
        ol.createEl('li', {text: 'Copy the generated access token'});

        containerEl.createEl('br');

        new Setting(containerEl)
            .setName('Output Directory')
            .setDesc('Specify the directory to save converted files. If empty, files will be downloaded.')
            .addText(text => text
                .setPlaceholder('Example: /Users/username/Documents/hugo-blog')
                .setValue(this.plugin.settings.outputDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.outputDirectory = value;
                    await this.plugin.saveSettings();
                }));
    }
}
