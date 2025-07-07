# Hugo Converter Plugin - 開発メモ

## プロジェクト概要

ObsidianのノートをHugoブログ形式に変換するプラグイン。

### 主な機能
- Obsidianマークダウン → Hugo形式変換
- タグの自動変換（`#タグ名` → YAML frontmatter）
- 画像の自動Gyazoアップロード
- 内部リンクの変換
- 元記事の画像URL自動更新

## コーディング規約
- .editorconfig準拠
- ESLint準拠

## 開発フロー

### 新機能追加時
1. TypeScriptで実装
2. `npm run lint` でコードチェック
3. `npm run build` でビルド確認
4. 動作テスト

### リリース時
1. `package.json` のバージョン更新
2. `npm run version` でmanifest.json更新
3. `git tag` でタグ作成・push
4. GitHub Actionsで自動リリース

## 技術仕様

### 外部API
- Gyazo Upload API

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

- 画像アップロード前に必ずGyazoアクセストークンの設定確認
- エラーハンドリングでユーザー体験を重視
- 元ファイルの更新は慎重に（バックアップ推奨通知）
- 大量画像の一括アップロード時のレート制限に注意

