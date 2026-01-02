
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


