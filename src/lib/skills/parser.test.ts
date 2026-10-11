import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateSkillMd, parseSkillMd } from './parser';
import { BUNDLED_SKILLS } from './bundled';

function frontmatterOf(yaml: string) {
  const parsed = parseSkillMd(`---\nname: demo\ndescription: Demo skill\n${yaml}\n---\nBody`);
  assert.ok(parsed);
  return parsed.frontmatter;
}

describe('parseSkillMd', () => {
  it('parses every bundled skill with string fields', () => {
    for (const skill of BUNDLED_SKILLS) {
      const parsed = parseSkillMd(skill.content);
      assert.ok(parsed, skill.name);
      assert.equal(parsed.frontmatter.name, skill.name);
      assert.equal(typeof parsed.frontmatter.description, 'string');
      const allowedTools = parsed.frontmatter['allowed-tools'];
      assert.ok(allowedTools === undefined || typeof allowedTools === 'string', skill.name);
    }
  });

  it('keeps the spec allowed-tools string as is', () => {
    assert.equal(frontmatterOf('allowed-tools: web_search save_memory')['allowed-tools'], 'web_search save_memory');
  });

  it('reads allowed-tools written as a block list', () => {
    assert.equal(frontmatterOf('allowed-tools:\n  - web_search\n  - save_memory')['allowed-tools'], 'web_search save_memory');
    assert.equal(frontmatterOf('allowed-tools:\n- web_search\nlicense: MIT')['allowed-tools'], 'web_search');
  });

  it('reads allowed-tools written as a flow list', () => {
    assert.equal(frontmatterOf('allowed-tools: [web_search, save_memory]')['allowed-tools'], 'web_search save_memory');
  });

  it('drops an allowed-tools mapping instead of passing an object on', () => {
    const frontmatter = frontmatterOf('allowed-tools:\n  web_search: true');
    assert.equal('allowed-tools' in frontmatter, false);
  });

  it('still reads the metadata block', () => {
    assert.deepEqual(frontmatterOf('metadata:\n  author: medha\n  version: "1.0"').metadata, {
      author: 'medha',
      version: '1.0',
    });
  });

  it('keeps the metadata mapping when one of its entries holds a list', () => {
    const frontmatter = frontmatterOf('metadata:\n  author: x\n  version: "2"\n  tags:\n    - t1\nlicense: MIT');
    assert.deepEqual(frontmatter.metadata, { author: 'x', version: '2', tags: '' });
    assert.equal(frontmatter.license, 'MIT');
  });

  it('round-trips through generateSkillMd', () => {
    const md = generateSkillMd({ name: 'demo', description: 'Demo: skill', 'allowed-tools': 'web_search' }, 'Body');
    const parsed = parseSkillMd(md);
    assert.ok(parsed);
    assert.equal(parsed.frontmatter.description, 'Demo: skill');
    assert.equal(parsed.frontmatter['allowed-tools'], 'web_search');
    assert.equal(parsed.body, 'Body');
  });
});
