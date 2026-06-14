import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, TFile, FileSystemAdapter } from 'obsidian';

interface HugoConverterSettings {
    outputDirectory: string;
}

const DEFAULT_SETTINGS: HugoConverterSettings = {
    outputDirectory: ''
}

// 本文中の画像参照1件を表す
interface ImageRef {
    marker: string;   // 本文中の元の文字列全体（置換対象）。例: "![[a.png]]" / "![alt](images/a.png)"
    tfile: TFile;     // vault内の実ファイル
    outName: string;  // static配下/参照URLで使うサニタイズ後ファイル名
}

export default class HugoConverterPlugin extends Plugin {
    settings: HugoConverterSettings;
    private statusBarItem: HTMLElement | null = null;

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

    onunload() {
        // プラグイン無効化時にStatus Barアイテムをクリーンアップ
        this.hideStatusBarProgress();
    }

    async convertToHugo(file: TFile | null) {
        if (!file) {
            new Notice('No file selected');
            return;
        }

        try {
            // ファイル内容を読み込み（元ノートは書き換えない）
            const content = await this.app.vault.read(file);

            // slug用の日付を決定（元ノートには書き込まない）
            const slugDate = this.resolveSlugDate(file, content);
            const slug = this.generateSlug(file.basename, slugDate);

            // 本文中の画像参照を出現順に収集
            const refs = this.collectImageRefs(content);

            new Notice('Converting to Hugo format...');

            // 画像を static/images/<slug>/ にコピー（クリーンビルド）
            if (this.settings.outputDirectory) {
                if (refs.length > 0) {
                    await this.copyImagesToStatic(refs, slug);
                }
            } else if (refs.length > 0) {
                new Notice('Output Directory が未設定のため画像をローカル配置できません');
            }

            // アイキャッチは本文の最初の画像
            const featured = this.pickFeaturedImage(refs, slug);

            // Hugo記事本文を生成
            const converted = this.convertContent(content, file.basename, slugDate, refs, slug, featured);
            const filename = `${slug}.md`;

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

    // slug生成に使う日付を決める。優先順位（いずれも元ノートには書き込まない）:
    //   1. 元ノートに既存の first_converted があれば流用（後方互換）
    //   2. 出力先に既存の同名slug記事があればその日付を再利用（再変換でslug固定）
    //   3. どちらも無ければ現在日時（新規記事の初回変換）
    resolveSlugDate(file: TFile, content: string): Date {
        const existing = this.extractFirstConvertedDate(content);
        if (existing) return existing;

        const fromOutput = this.findExistingSlugDate(file.basename);
        if (fromOutput) return fromOutput;

        return new Date();
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

    // 出力先に既に存在する同名slug記事のファイル名から日付(YYYYMMDD)を復元する。
    // toISOStringでの日付ズレを避けるため、ファイル名の8桁をそのままUTC基準のDateに変換する。
    findExistingSlugDate(filename: string): Date | null {
        const outputDir = this.settings.outputDirectory;
        if (!outputDir) return null;

        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) return null;

        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePath = require('path');

        const absDir = nodePath.isAbsolute(outputDir)
            ? outputDir
            : nodePath.join(adapter.getBasePath(), outputDir);

        if (!fs.existsSync(absDir)) return null;

        const baseSlug = this.slugifyBasename(filename);
        const escaped = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`^(\\d{8})00-${escaped}\\.md$`);

        for (const f of fs.readdirSync(absDir)) {
            const m = f.match(re);
            if (m) {
                const s = m[1];
                const date = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
                if (!isNaN(date.getTime())) return date;
            }
        }

        return null;
    }

    // 本文中の画像参照(Obsidian形式 ![[name]] / 標準形式 ![alt](path))を出現順に収集する。
    // 外部URL(http(s))はスキップ。vault内で解決できないものもスキップ。
    collectImageRefs(content: string): ImageRef[] {
        const combined = /!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]+)\)/g;
        const refs: ImageRef[] = [];
        const byPath = new Map<string, string>(); // tfile.path -> outName（同一画像は同じ名前）
        const usedNames = new Set<string>();

        let m: RegExpExecArray | null;
        while ((m = combined.exec(content)) !== null) {
            const marker = m[0];
            let tfile: TFile | null = null;

            if (m[1] !== undefined) {
                // Obsidian形式 ![[name]]
                const imageName = m[1];
                const possiblePaths = [`images/${imageName}`, imageName];
                for (const p of possiblePaths) {
                    const f = this.app.vault.getAbstractFileByPath(p);
                    if (f instanceof TFile) {
                        tfile = f;
                        break;
                    }
                }
            } else {
                // 標準Markdown形式 ![alt](path)
                const imagePath = m[3];
                if (/^https?:\/\//.test(imagePath)) continue; // 外部URLは対象外
                const normalized = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;
                const f = this.app.vault.getAbstractFileByPath(decodeURIComponent(normalized));
                if (f instanceof TFile) tfile = f;
            }

            if (!tfile) {
                console.warn('画像ファイルが見つかりません:', marker);
                continue;
            }

            // 同一画像は同じファイル名を使い回す。別画像で名前が衝突したら連番を付ける。
            let outName = byPath.get(tfile.path);
            if (!outName) {
                outName = this.sanitizeImageName(tfile.name);
                if (usedNames.has(outName)) {
                    const dot = outName.lastIndexOf('.');
                    const base = dot >= 0 ? outName.slice(0, dot) : outName;
                    const ext = dot >= 0 ? outName.slice(dot) : '';
                    let i = 2;
                    while (usedNames.has(`${base}-${i}${ext}`)) i++;
                    outName = `${base}-${i}${ext}`;
                }
                usedNames.add(outName);
                byPath.set(tfile.path, outName);
            }

            refs.push({ marker, tfile, outName });
        }

        return refs;
    }

    // 画像ファイル名をASCII安全な名前に変換する（日本語・スペース・記号対策）。
    sanitizeImageName(name: string): string {
        const dot = name.lastIndexOf('.');
        const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase().replace(/[^\w]/g, '') : '';
        let base = dot >= 0 ? name.slice(0, dot) : name;

        base = base
            .normalize('NFKD')
            .replace(/\s+/g, '-')      // 空白 → ハイフン
            .replace(/[^\w-]/g, '')    // 英数・アンダースコア・ハイフン以外を除去（日本語も除去）
            .replace(/-+/g, '-')       // 連続ハイフンを1つに
            .replace(/_+/g, '_')       // 連続アンダースコアを1つに
            .replace(/^[-_]+|[-_]+$/g, '') // 先頭・末尾の区切りを除去
            .toLowerCase();

        if (!base) base = 'image'; // 日本語のみのファイル名などで空になった場合

        return ext ? `${base}.${ext}` : base;
    }

    // Hugoルートを config.toml / hugo.toml の存在で上方向探索する。
    resolveHugoRoot(absoluteOutputDir: string): string {
        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePath = require('path');

        let dir = absoluteOutputDir;
        for (let i = 0; i < 10; i++) {
            if (fs.existsSync(nodePath.join(dir, 'config.toml')) ||
                fs.existsSync(nodePath.join(dir, 'hugo.toml'))) {
                return dir;
            }
            const parent = nodePath.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }

        // フォールバック: content/post から見て ../../ がHugoルートとみなす
        return nodePath.resolve(absoluteOutputDir, '..', '..');
    }

    // static/images/<slug>/ の絶対パスを求める。
    resolveStaticImagesDir(slug: string): string {
        const adapter = this.app.vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) {
            throw new Error('FileSystemAdapter is not available');
        }

        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePath = require('path');

        const outputDir = this.settings.outputDirectory;
        const absOut = nodePath.isAbsolute(outputDir)
            ? outputDir
            : nodePath.join(adapter.getBasePath(), outputDir);

        const hugoRoot = this.resolveHugoRoot(absOut);
        return nodePath.join(hugoRoot, 'static', 'images', slug);
    }

    // クリーンビルド前の安全ガード。.../static/images/<非空slug> 以外を消さない。
    assertSafeImageDir(target: string, slug: string): void {
        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePath = require('path');

        if (!slug || slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
            throw new Error(`不正なslugです: "${slug}"`);
        }

        const parts = target.split(nodePath.sep).filter(Boolean);
        const last = parts[parts.length - 1];
        const parent = parts[parts.length - 2];
        const grand = parts[parts.length - 3];

        if (last !== slug || parent !== 'images' || grand !== 'static') {
            throw new Error(`想定外の画像ディレクトリのため処理を中断しました: ${target}`);
        }
    }

    // アイキャッチ(image:)。本文の最初の画像を採用する。
    pickFeaturedImage(refs: ImageRef[], slug: string): string | null {
        if (refs.length === 0) return null;
        return `/images/${slug}/${encodeURIComponent(refs[0].outName)}`;
    }

    // 画像を static/images/<slug>/ にコピー。再変換時はフォルダを一旦空にしてからコピーする。
    async copyImagesToStatic(refs: ImageRef[], slug: string): Promise<void> {
        const target = this.resolveStaticImagesDir(slug);
        this.assertSafeImageDir(target, slug);

        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // @ts-ignore: require is available in Obsidian environment
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodePath = require('path');

        // クリーンビルド: 既存フォルダを削除して作り直す（ゴミ画像を残さない）
        if (fs.existsSync(target)) {
            fs.rmSync(target, { recursive: true, force: true });
        }
        fs.mkdirSync(target, { recursive: true });

        // 同一画像は1回だけコピーする
        const copied = new Set<string>();
        const uniqueRefs = refs.filter(ref => {
            if (copied.has(ref.outName)) return false;
            copied.add(ref.outName);
            return true;
        });

        let current = 0;
        this.updateStatusBarProgress(current, uniqueRefs.length, 'Copying images');

        for (const ref of uniqueRefs) {
            try {
                const arrayBuffer = await this.app.vault.readBinary(ref.tfile);
                fs.writeFileSync(nodePath.join(target, ref.outName), Buffer.from(arrayBuffer));
            } catch (error) {
                console.error('画像コピーエラー:', ref.outName, error);
            }
            current++;
            this.updateStatusBarProgress(current, uniqueRefs.length, 'Copying images');
        }

        this.hideStatusBarProgress();
    }

    // 本文中の画像参照を /images/<slug>/<file> 形式に書き換える。
    rewriteImagePaths(content: string, refs: ImageRef[], slug: string): string {
        let result = content;
        for (const ref of refs) {
            const url = `/images/${slug}/${encodeURIComponent(ref.outName)}`;
            // markerに正規表現特殊文字が含まれても安全なよう split/join で全置換する
            result = result.split(ref.marker).join(`![](${url})`);
        }
        return result;
    }

    updateStatusBarProgress(current: number, total: number, message: string): void {
        if (!this.statusBarItem) {
            this.statusBarItem = this.addStatusBarItem();
        }

        const percentage = total > 0 ? Math.round((current / total) * 100) : 100;
        const progressBar = '█'.repeat(Math.floor(percentage / 5)) + '░'.repeat(20 - Math.floor(percentage / 5));
        const statusText = `${message} [${progressBar}] ${current}/${total}`;

        this.statusBarItem.setText(statusText);
        this.statusBarItem.title = `${message}: ${percentage}% complete`;
    }

    hideStatusBarProgress(): void {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
            this.statusBarItem = null;
        }
    }

    formatDateToJST(date: Date): string {
        // 日本時間に変換（UTC+9）
        const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        // ISO形式で出力し、末尾の'Z'を'+09:00'に置換
        return jstDate.toISOString().replace('Z', '+09:00');
    }

    convertContent(content: string, filename: string, slugDate: Date,
                   refs: ImageRef[] = [], slug?: string, featured: string | null = null): string {
        const lines = content.split('\n');
        const tagLines: string[] = [];
        const contentLines: string[] = [];
        let tags: string[] = [];

        // タグ行を判定し、タグを抽出
        lines.forEach(line => {
            const trimmedLine = line.trim();
            const tagRegex = /^#[^\s#]+(?: #[^\s#]+)*$/;
            if (tagRegex.test(trimmedLine)) {
                tagLines.push(line);
                const lineTags = trimmedLine.split(/\s+/).filter(Boolean).map(tag => tag.substring(1));
                tags = tags.concat(lineTags);
            } else {
                contentLines.push(line);
            }
        });

        // タグの重複を削除
        tags = [...new Set(tags)];

        // frontmatterを削除
        let cleanContent = contentLines.join('\n');
        cleanContent = cleanContent.replace(/^---\n[\s\S]*?\n---\n*/m, '');

        // タイトルを取得（最初の#見出しまたはファイル名）
        const titleMatch = cleanContent.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : filename.replace(/\.md$/, '');

        // 画像参照をローカルパスに変換（内部リンク変換より前に行う）
        if (slug) {
            cleanContent = this.rewriteImagePaths(cleanContent, refs, slug);
        }

        // 内部リンクを変換
        cleanContent = cleanContent.replace(/\[\[([^\]]+)\]\]/g, (match, p1) => {
            // 単純にリンクテキストとして表示
            return p1;
        });

        // YouTubeのURLをHugoのshortcodeに変換
        const youtubeRegex = /(https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)|https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+))/g;
        cleanContent = cleanContent.replace(youtubeRegex, (match, url, videoId1, videoId2) => {
            const videoId = videoId1 || videoId2;
            return `{{< youtube ${videoId} >}}`;
        });

        // frontmatterを生成
        const imageLine = featured ? `\nimage: ${featured}` : '';
        const frontmatter = `---
title: "${title}"
date: ${this.formatDateToJST(slugDate)}
slug: ${this.generateSlug(filename, slugDate)}
tags:${tags.length > 0 ? '\n' + tags.map(tag => `  - ${tag}`).join('\n') : ' []'}${imageLine}
draft: false
---`;

        return `${frontmatter}\n\n${cleanContent}`;
    }

    // ファイル名からslug本体部分（日付を除いた部分）を生成する。
    slugifyBasename(filename: string): string {
        return filename
            .replace(/\.md$/, '')
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // 特殊文字を削除
            .replace(/\s+/g, '-')     // スペースをハイフンに
            .replace(/-+/g, '-')      // 連続ハイフンを1つに
            .trim();
    }

    generateSlug(filename: string, date: Date): string {
        // 日付をYYYYMMDD形式でフォーマット
        const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
        return `${dateStr}00-${this.slugifyBasename(filename)}`;
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
            .setName('Output Directory')
            .setDesc('変換後の記事を保存するディレクトリ(例: Hugoの content/post)。画像は同じHugoサイトの static/images/<slug>/ に保存されます。空の場合はダウンロードされます。')
            .addText(text => text
                .setPlaceholder('Example: /Users/username/blog/content/post')
                .setValue(this.plugin.settings.outputDirectory)
                .onChange(async (value) => {
                    this.plugin.settings.outputDirectory = value;
                    await this.plugin.saveSettings();
                }));
    }
}
