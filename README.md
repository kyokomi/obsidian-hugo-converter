# Hugo Converter Plugin for Obsidian

A plugin that converts Obsidian notes to Hugo blog format.

## Features

- 📝 Convert Obsidian markdown articles to Hugo format
- 🏷️ Automatic tag conversion (`#tagname` → YAML frontmatter)
- 🖼️ Copy images into the Hugo site's `static/images/<slug>/` (no external service)
- 🔗 Internal link conversion
- 📅 Automatic frontmatter generation (featured image = first image in the body)
- 🛡️ Leaves the source Obsidian note untouched

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
2. Set **Output Directory** to your Hugo site's posts directory (e.g. `/path/to/blog/content/post`).
   - Images are saved to `static/images/<slug>/` under the same Hugo site (the Hugo root is auto-detected by locating `config.toml`).
   - If left empty, the converted file is downloaded instead (images cannot be copied in this mode).

## Usage

1. To convert an article, use one of the following methods:
   - Right-click in the editor → "Convert to Hugo blog"
   - Right-click in file explorer → "Convert to Hugo blog"
   - Command palette (Cmd/Ctrl+P) → "Convert to Hugo blog"

2. Images are copied into `static/images/<slug>/` and referenced as `/images/<slug>/...` (the source note is not modified)
3. The converted file is saved to the Output Directory (or downloaded) in `YYYYMMDD00-slug.md` format

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

The image file is copied to `static/images/<slug>/` and the reference is rewritten to a local absolute path. The first image in the body is also used as the `image:` (featured image) in the frontmatter.

```markdown
![[Pasted image 20220529164221.png]]
```
↓
```markdown
![](/images/<slug>/pasted-image-20220529164221.png)
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