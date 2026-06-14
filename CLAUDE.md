# Hugo Converter Plugin - 開発メモ

## プロジェクト概要

ObsidianのノートをHugoブログ形式に変換するプラグイン。

### 主な機能
- Obsidianマークダウン → Hugo形式変換
- タグの自動変換（`#タグ名` → YAML frontmatter）
- 画像をHugoサイトの `static/images/<slug>/` にコピー（外部サービス不要）
- 内部リンクの変換
- アイキャッチ（`image:`）に本文の最初の画像を自動採用
- 元のObsidianノートは書き換えない

## コーディング規約
- .editorconfig準拠
- ESLint準拠
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)準拠

## 開発フロー

### 新機能追加時
1. TypeScriptで実装
2. `npm run lint` でコードチェック
3. `npm run build` でビルド確認
4. 動作テスト

### リリース時
1. バージョン更新（以下のいずれかを実行）
   - `npm run bump-patch` - パッチバージョンを上げる (例: 0.2.1 → 0.2.2)
   - `npm run bump-minor` - マイナーバージョンを上げる (例: 0.2.1 → 0.3.0)
   - `npm run bump-major` - メジャーバージョンを上げる (例: 0.2.1 → 1.0.0)
2. 変更をコミット
3. `git tag 0.x.x` でタグ作成
4. `git push && git push --tags` でpush
5. GitHub Actionsで自動リリース

## 技術仕様

### 画像の扱い
- 画像はHugoサイトの `static/images/<slug>/` にコピーする（旧: Gyazoアップロード）
- Hugoルートは出力先から `config.toml` を上方向探索して自動検出
- 参照は `/images/<slug>/<file>` の絶対パス。アイキャッチは本文の最初の画像
- 外部API依存なし

## ファイル構成

```
hugo-converter/
├── main.ts              # メインプラグインファイル
├── manifest.json        # プラグインメタデータ
├── package.json         # Node.js設定
├── tsconfig.json        # TypeScript設定
├── .eslintrc           # ESLint設定
├── .editorconfig       # エディタ設定
├── esbuild.config.mjs  # ビルド設定
├── version-bump.mjs    # バージョン管理
├── versions.json       # バージョン履歴
├── styles.css          # プラグインCSS
├── .hotreload         # 開発用
└── .github/
    └── workflows/
        └── release.yml # GitHub Actions
```

## 注意事項

- Output Directory（Hugoの content/post）を設定すること。未設定時はダウンロードにフォールバック
- エラーハンドリングでユーザー体験を重視
- 元のObsidianノートは書き換えない（画像参照はそのまま。再変換でもslugは固定）
- 再変換時は `static/images/<slug>/` をクリーンビルド（`.../static/images/<slug>` 以外を消さない安全ガードあり）

