
import { describe, it, expect, jest } from '@jest/globals';

import HugoConverterPlugin from '../main';

import { App } from 'obsidian';



// HugoConverterPluginのインスタンスを作成するために、最低限必要なAppのモックを作成

const mockApp = {

    vault: {

        // readとmodifyはテストケースごとにモックする

    },

    workspace: {

        on: jest.fn(),

    },

    // 他にも必要なプロパティがあれば追加

} as unknown as App;



describe('HugoConverterPlugin.convertContent', () => {

    const plugin = new HugoConverterPlugin(mockApp, {
        id: 'test-plugin',
        name: 'Test Plugin',
        author: 'test',
        version: '1.0.0',
        minAppVersion: '0.9.0', // 追加
        description: 'A test plugin for Hugo Converter', // 追加
        dir: ''
    });

    const dummyFilename = 'test-file.md';

    const dummyDate = new Date('2025-12-31T10:00:00.000Z');

    it('removes multiline writing notes before extracting tags and the title', () => {
        const content = '本文\n\n%%\n執筆メモ（本文には出さない）\n# 非公開タイトル\n#非公開タグ\n下書き作成: 2026-10-11\n%%\n\n続き';
        const result = plugin.convertContent(content, dummyFilename, dummyDate);
        expect(result).toContain('本文');
        expect(result).toContain('続き');
        expect(result).toContain('title: "test-file"');
        expect(result).toContain('tags: []');
        expect(result).not.toMatch(/%%|執筆メモ|非公開|下書き作成/);
    });

    it('removes inline and multiple comments without removing surrounding text', () => {
        expect(plugin.stripObsidianComments('前%%メモ%%中%%別のメモ%%後')).toBe('前中後');
    });

    it('removes an unclosed comment through the end of the note', () => {
        expect(plugin.stripObsidianComments('本文\n%% 非公開\nメモ')).toBe('本文\n');
    });

    it.each([
        '`%% サンプル %%`',
        '`` `%% サンプル %%` ``',
        '```markdown\n%% サンプル %%\n```',
        '~~~markdown\n%% サンプル %%\n~~~',
    ])('preserves comment syntax inside code: %s', code => {
        expect(plugin.stripObsidianComments(code + '\n%% 非公開 %%')).toBe(code + '\n');
    });



    it('should extract tags correctly when they are after frontmatter', () => {

        const content = `---

draft: false

---



#振り返り #blog



This is a test content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags:\n  - 振り返り\n  - blog');

    });



    it('should not misinterpret headings as tags', () => {

        const content = `# This is a heading



This is a test content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags: []');

    });



    it('should handle content with no tags', () => {

        const content = `This is a test content with no tags.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags: []');

    });



    it('should extract hierarchical tags correctly', () => {

        const content = `#topic/sub-topic #another/tag



This is a test content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags:\n  - topic/sub-topic\n  - another/tag');

    });



    it('should extract multiple tags on the same line', () => {

        const content = `#tag1 #tag2 #tag3



This is a test content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags:\n  - tag1\n  - tag2\n  - tag3');

    });



    it('should extract tags from the beginning of the file', () => {

        const content = `#first #second



This is a test content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).toContain('tags:\n  - first\n  - second');

    });



    it('should remove the tag line from the final content', () => {

        const content = `---

draft: false

---



#振り返り #blog



This is the actual content.`;

        const result = plugin.convertContent(content, dummyFilename, dummyDate);

        expect(result).not.toContain('#振り返り #blog');

        expect(result).toContain('This is the actual content.');

    });

});



describe('HugoConverterPlugin.resolveBaseSlug', () => {

    const plugin = new HugoConverterPlugin(mockApp, {
        id: 'test-plugin',
        name: 'Test Plugin',
        author: 'test',
        version: '1.0.0',
        minAppVersion: '0.9.0',
        description: 'A test plugin for Hugo Converter',
        dir: ''
    });

    const dummyDate = new Date('2025-12-31T10:00:00.000Z');

    it('should use frontmatter slug when present', () => {
        const content = `---
slug: parental-leave-return
---

# 半年くらい育休して復職してどうか？
`;
        expect(plugin.resolveBaseSlug('半年くらい育休して復職してどうか？', content)).toBe('parental-leave-return');
    });

    it('should strip quotes and normalize frontmatter slug', () => {
        const content = `---
slug: "Parental Leave Return"
---
body`;
        expect(plugin.resolveBaseSlug('foo', content)).toBe('parental-leave-return');
    });

    it('should slugify filename when frontmatter slug is absent', () => {
        expect(plugin.resolveBaseSlug('My Test File', 'body')).toBe('my-test-file');
    });

    it('should fall back to hashed slug for Japanese-only filename', () => {
        const slug = plugin.resolveBaseSlug('半年くらい育休して復職してどうか？', 'body');
        expect(slug).toMatch(/^post-[0-9a-f]{8}$/);
        // 決定的であること（再変換でslugが変わらない）
        expect(plugin.resolveBaseSlug('半年くらい育休して復職してどうか？', 'body')).toBe(slug);
        // 別タイトルなら別slugになること
        expect(plugin.resolveBaseSlug('別の記事', 'body')).not.toBe(slug);
    });

    it('should never produce a slug ending with a dash', () => {
        const slug = plugin.generateSlug(plugin.resolveBaseSlug('日本語だけ', 'body'), dummyDate);
        expect(slug).toMatch(/^2025123100-post-[0-9a-f]{8}$/);
    });

    it('should write the resolved slug into frontmatter via convertContent', () => {
        const content = `---
slug: custom-slug
---

body`;
        const result = plugin.convertContent(content, '日本語タイトル.md', dummyDate);
        expect(result).toContain('slug: 2025123100-custom-slug');
    });
});

describe('HugoConverterPlugin image refs with size/alt options', () => {
    // TFileのモックはクラスなので instanceof で判定できる
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TFile } = require('obsidian');
    const image = new TFile('images/weekday-timeline-1.png');

    const appWithImage = {
        vault: {
            getAbstractFileByPath: (p: string) => (p === 'images/weekday-timeline-1.png' ? image : null),
        },
        metadataCache: {
            getFirstLinkpathDest: (link: string) => (link === 'weekday-timeline-1.png' ? image : null),
        },
        workspace: { on: jest.fn() },
    } as unknown as App;

    const plugin = new HugoConverterPlugin(appWithImage, {
        id: 'test-plugin',
        name: 'Test Plugin',
        author: 'test',
        version: '1.0.0',
        minAppVersion: '0.9.0',
        description: 'A test plugin for Hugo Converter',
        dir: ''
    });

    it('parses ![[name|480]] as width', () => {
        expect(plugin.parseWikiImageLink('a.png|480')).toEqual({ link: 'a.png', width: 480 });
    });

    it('parses ![[name|480x300]] as width and height', () => {
        expect(plugin.parseWikiImageLink('a.png|480x300')).toEqual({ link: 'a.png', width: 480, height: 300 });
    });

    it('parses ![[name|説明|480]] as alt and width, and strips #heading', () => {
        expect(plugin.parseWikiImageLink('a.png#sec|説明|480')).toEqual({ link: 'a.png', alt: '説明', width: 480 });
    });

    it('resolves ![[name|480]] and rewrites with ?width= query', () => {
        const content = '本文\n\n![[weekday-timeline-1.png|480]]\n\n続き';
        const refs = plugin.collectImageRefs(content, '00_Inbox/note.md');
        expect(refs).toHaveLength(1);
        expect(refs[0].outName).toBe('weekday-timeline-1.png');
        expect(refs[0].width).toBe(480);

        const out = plugin.rewriteImagePaths(content, refs, '2026090600-post-x');
        expect(out).toContain('![](/images/2026090600-post-x/weekday-timeline-1.png?width=480)');
        expect(out).not.toContain('[[');
    });

    it('rewrites without query when no size is given', () => {
        const content = '![[weekday-timeline-1.png]]';
        const refs = plugin.collectImageRefs(content);
        const out = plugin.rewriteImagePaths(content, refs, 's');
        expect(out).toBe('![](/images/s/weekday-timeline-1.png)');
    });

    it('keeps standard markdown alt text', () => {
        const content = '![説明](images/weekday-timeline-1.png)';
        const refs = plugin.collectImageRefs(content);
        const out = plugin.rewriteImagePaths(content, refs, 's');
        expect(out).toBe('![説明](/images/s/weekday-timeline-1.png)');
    });

    it('does not collect images or choose a featured image from comments', () => {
        const content = '%%\n![下書き](images/weekday-timeline-1.png)\n![[weekday-timeline-1.png]]\n%%\n本文';
        const refs = plugin.collectImageRefs(content, '00_Inbox/note.md');
        expect(refs).toHaveLength(0);
        expect(plugin.pickFeaturedImage(refs, 's')).toBeNull();
    });

    it('resolves a parent-relative image and uses it in the body and featured image', () => {
        const content = '![構成図](../images/weekday-timeline-1.png)';
        const refs = plugin.collectImageRefs(content, '00_Inbox/個人開発.md');
        expect(refs).toHaveLength(1);
        expect(refs[0].tfile).toBe(image);
        const featured = plugin.pickFeaturedImage(refs, 's');
        const out = plugin.convertContent(content, '個人開発', new Date('2026-10-11T00:00:00Z'), refs, 's', featured);
        expect(out).toContain('![構成図](/images/s/weekday-timeline-1.png)');
        expect(out).toContain('image: /images/s/weekday-timeline-1.png');
    });

    it.each([
        ['../images/weekday-timeline-1.png', '00_Inbox/note.md'],
        ['../../images/weekday-timeline-1.png', 'notes/drafts/note.md'],
        ['./weekday-timeline-1.png', 'images/note.md'],
        ['weekday-timeline-1.png', 'images/note.md'],
        ['../images/weekday%2Dtimeline-1.png', '00_Inbox/note.md'],
        ['/images/weekday-timeline-1.png', '00_Inbox/note.md'],
        ['images/weekday-timeline-1.png', '00_Inbox/note.md'],
        ['images/weekday-timeline-1.png', 'note.md'],
    ])('resolves %s from %s', (link, source) => {
        expect(plugin.resolveMarkdownImageFile(link, source)).toBe(image);
    });

    it('prefers an image relative to the note when a root image also exists', () => {
        const local = new TFile('00_Inbox/images/weekday-timeline-1.png');
        const lookup = jest.spyOn(appWithImage.vault, 'getAbstractFileByPath');
        lookup.mockImplementation((p: string) => p === local.path ? local : p === image.path ? image : null);
        try {
            expect(plugin.resolveMarkdownImageFile('images/weekday-timeline-1.png', '00_Inbox/note.md')).toBe(local);
            expect(plugin.resolveMarkdownImageFile('/images/weekday-timeline-1.png', '00_Inbox/note.md')).toBe(image);
            expect(plugin.resolveMarkdownImageFile('./images/weekday-timeline-1.png', 'missing/note.md')).toBeNull();
            expect(plugin.resolveMarkdownImageFile('../../images/weekday-timeline-1.png', '00_Inbox/note.md')).toBeNull();
        } finally {
            lookup.mockRestore();
        }
    });
});
