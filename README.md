# Hugo Converter Plugin for Obsidian

A plugin that converts Obsidian notes to Hugo blog format.

## Features

- 📝 Convert Obsidian markdown articles to Hugo format
- 🏷️ Automatic tag conversion (`#tagname` → YAML frontmatter)
- 🖼️ Automatic image upload to Gyazo
- 🔗 Internal link conversion
- 📅 Automatic frontmatter generation
- 💾 Automatic image URL update in source article

## Installation

### Manual Installation

1. Clone or download this repository
2. Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/hugo-converter/`
3. Restart Obsidian
4. Go to Settings → Community plugins → Enable Hugo Converter

### Obsidian Community Plugin (Coming Soon)

This plugin will be submitted to the Community Plugins repository.

## Configuration

1. Go to Obsidian Settings → Community plugins → Hugo Converter → Settings
2. Get and enter your Gyazo access token:
   - Visit https://gyazo.com/oauth/applications
   - Click "Register new application"
   - Enter an application name and register
   - Copy the generated access token and paste it into the settings

## Usage

1. To convert an article, use one of the following methods:
   - Right-click in the editor → "Convert to Hugo blog"
   - Right-click in file explorer → "Convert to Hugo blog"
   - Command palette (Cmd/Ctrl+P) → "Convert to Hugo blog"

2. Images will be automatically uploaded to Gyazo
3. The converted file will be downloaded in `YYYYMMDD01-slug.md` format

## Conversion Features

### Tag Conversion
```markdown
#Web #Management-Tools

# Article Title
```
↓
```yaml
---
title: "Article Title"
tags:
  - Web
  - Management-Tools
---
```

### Image Conversion
```markdown
![[Pasted image 20220529164221.png]]
```
↓
```markdown
![Pasted image 20220529164221](https://gyazo.com/xxx.png)
```

### Internal Link Conversion
```markdown
[[Article Name]]
```
↓
```markdown
Article Name
```

## Development

```bash
# Install dependencies
npm install

# Development (watch mode)
npm run dev

# Build
npm run build

# Lint
npm run lint
npm run lint:fix
```

## Release

Automatic release using GitHub Actions:

1. Update version in `package.json`
2. Run `npm run version` to update manifest.json and versions.json
3. Create and push a Git tag
4. GitHub Actions will automatically create a release

## License

MIT License

## Author

kyokomi