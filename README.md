# Hugo Converter Plugin for Obsidian

ObsidianのノートをHugoブログ形式に変換するプラグインです。

## 機能

- 📝 Obsidianのマークダウン記事をHugo形式に変換
- 🏷️ タグの自動変換（`#タグ名` → YAML frontmatter）
- 🖼️ 画像の自動Gyazoアップロード
- 🔗 内部リンクの変換
- 📅 自動的なfrontmatter生成
- 💾 元記事の画像URLを自動更新

## インストール

### 手動インストール

1. このリポジトリをクローンまたはダウンロード
2. `main.js`、`manifest.json`、`styles.css`を`.obsidian/plugins/hugo-converter/`にコピー
3. Obsidianを再起動
4. 設定 → コミュニティプラグイン → Hugo Converterを有効化

### Obsidianコミュニティプラグイン（予定）

コミュニティプラグインとして申請予定です。

## 設定

1. Obsidianの設定 → コミュニティプラグイン → Hugo Converter → 設定
2. Gyazoアクセストークンを取得して入力：
   - https://gyazo.com/oauth/applications にアクセス
   - 「新しいアプリケーションを登録」をクリック
   - アプリケーション名を入力して登録
   - 生成されたアクセストークンをコピーして設定に貼り付け

## 使い方

1. 変換したい記事で以下のいずれかの方法：
   - エディタで右クリック → 「Hugoブログに変換」
   - ファイルエクスプローラーで右クリック → 「Hugoブログに変換」
   - コマンドパレット（Cmd/Ctrl+P）→ 「Hugoブログに変換」

2. 画像がある場合は自動でGyazoにアップロードされます
3. 変換されたファイルが`YYYYMMDD01-slug.md`形式でダウンロードされます

## 変換機能

### タグ変換
```markdown
#Web #管理ツール

# 記事タイトル
```
↓
```yaml
---
title: "記事タイトル"
tags:
  - Web
  - 管理ツール
---
```

### 画像変換
```markdown
![[Pasted image 20220529164221.png]]
```
↓
```markdown
![Pasted image 20220529164221](https://gyazo.com/xxx.png)
```

### 内部リンク変換
```markdown
[[記事名]]
```
↓
```markdown
記事名
```

## 開発

```bash
# 依存関係のインストール
npm install

# 開発時（ウォッチモード）
npm run dev

# ビルド
npm run build

# Lint
npm run lint
npm run lint:fix
```

## リリース

GitHub Actionsを使用して自動リリースします：

1. `package.json`のバージョンを更新
2. `npm run version`でmanifest.jsonとversions.jsonを更新
3. Gitタグを作成してpush
4. GitHub Actionsが自動でリリースを作成

## ライセンス

MIT License

## 作者

kyokomi