#!/usr/bin/env node

/**
 * md-cli copy command
 * 读取 markdown 文件，转换为带样式的 HTML 并复制到剪贴板
 * 用法: md-cli copy <file.md> [选项]
 *
 * 选项:
 *   --theme=<name>    主题名称 (default, grace, simple)，默认 default
 *   --primary-color   主题色，默认 #576b95
 *   --inline          使用内联样式（更适合微信公众号），默认开启
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgv } from './util.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 主题颜色配置
const themes = {
  default: {
    primary: '#576b95',
    h2Bg: '#576b95',
    h2Color: '#fff',
    strongColor: '#576b95',
    linkColor: '#576b95',
    codeColor: '#d14',
    blockquoteBorder: '#576b95',
  },
  grace: {
    primary: '#e78170',
    h2Bg: '#e78170',
    h2Color: '#fff',
    strongColor: '#e78170',
    linkColor: '#e78170',
    codeColor: '#e78170',
    blockquoteBorder: '#e78170',
  },
  simple: {
    primary: '#333',
    h2Bg: 'transparent',
    h2Color: '#333',
    strongColor: '#333',
    linkColor: '#333',
    codeColor: '#333',
    blockquoteBorder: '#333',
  },
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = parseArgv()

  // 从 process.argv 获取文件路径 (copy 命令后的第一个参数)
  const filePath = process.argv[3] || args.file || args.f

  if (!filePath) {
    console.error('用法: md-cli copy <文件路径> [选项]')
    console.error('示例: md-cli copy article.md')
    console.error('       md-cli copy article.md --theme=grace')
    console.error('')
    console.error('选项:')
    console.error('  --theme=<name>      主题名称: default, grace, simple (默认: default)')
    console.error('  --primary-color     主题色 (默认: #576b95)')
    console.error('  --no-inline        禁用内联样式，使用 CSS 类')
    process.exit(1)
  }

  const themeName = args['--theme'] || 'default'
  const customColor = args['--primary-color'] || args['--color']
  const useInline = args['--no-inline'] !== true

  // 合并主题颜色
  const theme = { ...themes[themeName] || themes.default }
  if (customColor) {
    theme.primary = customColor
    theme.h2Bg = customColor
    theme.strongColor = customColor
    theme.linkColor = customColor
    theme.codeColor = customColor
    theme.blockquoteBorder = customColor
  }

  return { filePath, theme, useInline }
}

/**
 * 将 CSS 字符串转换为内联样式
 */
function cssToInlineStyles(css, colorMap) {
  const rules = {}

  // 解析 CSS 规则
  const ruleRegex = /([^{}]+)\s*\{([^}]+)\}/g
  let match
  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim()
    const properties = match[2].trim()

    // 解析属性
    const styleObj = {}
    properties.split(';').forEach(prop => {
      const [key, value] = prop.split(':').map(s => s.trim())
      if (key && value) {
        // 转换 CSS 属性名为驼峰
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
        styleObj[camelKey] = value
      }
    })

    // 简化选择器匹配
    const tagMatch = selector.match(/^([a-z]+)/i)
    if (tagMatch) {
      const tag = tagMatch[1].toLowerCase()
      if (!rules[tag]) rules[tag] = []
      rules[tag].push(styleObj)
    }
  }

  return rules
}

/**
 * 将 HTML 转换为使用内联样式的版本
 */
function applyInlineStyles(html, theme) {
  // 定义各元素的默认样式
  const defaultStyles = {
    h1: `display: table; padding: 0 1em; border-bottom: 2px solid ${theme.primary}; margin: 2em auto 1em; font-size: 1.2em; font-weight: bold; text-align: center; color: #333;`,
    h2: `display: table; padding: 0 0.2em; margin: 4em auto 2em; background: ${theme.h2Bg}; color: ${theme.h2Color}; font-size: 1.2em; font-weight: bold; text-align: center;`,
    h3: `padding-left: 8px; border-left: 3px solid ${theme.primary}; margin: 2em 8px 0.75em 0; font-size: 1.1em; font-weight: bold; line-height: 1.2; color: #333;`,
    h4: `margin: 2em 8px 0.5em; color: ${theme.primary}; font-weight: bold;`,
    h5: `margin: 1.5em 8px 0.5em; color: ${theme.primary}; font-weight: bold;`,
    h6: `margin: 1.5em 8px 0.5em; color: ${theme.primary};`,
    p: `margin: 1.5em 8px; letter-spacing: 0.1em; color: #333; line-height: 1.75;`,
    blockquote: `font-style: normal; padding: 1em; border-left: 4px solid ${theme.blockquoteBorder}; border-radius: 6px; margin-bottom: 1em; color: #333; background: rgba(0,0,0,0.03);`,
    code: `font-size: 90%; color: ${theme.codeColor}; background: rgba(27, 31, 35, 0.05); padding: 3px 5px; border-radius: 4px;`,
    pre: `font-size: 90%; overflow-x: auto; border-radius: 8px; padding: 0.5em 1em; background: #f6f8fa; margin: 10px 8px;`,
    a: `color: ${theme.linkColor}; text-decoration: none;`,
    strong: `color: ${theme.strongColor}; font-weight: bold;`,
    em: `font-style: italic;`,
    hr: `border-style: solid; border-width: 2px 0 0; border-color: rgba(0, 0, 0, 0.1); height: 0.4em; margin: 1.5em 0;`,
    table: `border-collapse: collapse; width: 100%; margin: 1em 8px;`,
    th: `border: 1px solid #dfdfdf; padding: 0.25em 0.5em; font-weight: bold; background: rgba(0, 0, 0, 0.05);`,
    td: `border: 1px solid #dfdfdf; padding: 0.25em 0.5em;`,
    ul: `list-style: circle; padding-left: 1em; margin-left: 0; color: #333;`,
    ol: `padding-left: 1em; margin-left: 0; color: #333;`,
    li: `margin: 0.2em 8px;`,
    figure: `margin: 1.5em 8px;`,
    figcaption: `text-align: center; color: #888; font-size: 0.8em;`,
    img: `display: block; max-width: 100%; margin: 0.1em auto 0.5em; border-radius: 4px;`,
  }

  // 替换 var(--md-primary-color) 为实际颜色
  let result = html
  for (const [key, value] of Object.entries(theme)) {
    result = result.replace(new RegExp(`var\\(--md-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}\\)`, 'g'), value)
  }
  result = result.replace(/hsl\\(var\\(--foreground\\)\\)/g, '#333')

  // 为各个元素添加内联样式
  // 注意：这是一个简化版本，实际应该使用 DOM 解析
  for (const [tag, defaultStyle] of Object.entries(defaultStyles)) {
    const tagRegex = new RegExp(`<${tag}([^>]*)>`, 'gi')
    result = result.replace(tagRegex, (match, attrs) => {
      // 如果已经有 style 属性，跳过
      if (attrs.includes('style=')) return match
      return `<${tag}${attrs} style="${defaultStyle}">`
    })
  }

  return result
}

/**
 * 生成基础 CSS（用于非内联模式）
 */
function generateBaseCSS(theme) {
  return `
<style>
:root {
  --md-primary-color: ${theme.primary};
  --md-font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --md-font-size: 16px;
  --foreground: 0 0% 20%;
}
blockquote { background: rgba(0,0,0,0.03); }
</style>`
}

/**
 * 主函数
 */
async function main() {
  const { filePath, theme, useInline } = parseArgs()

  try {
    // 读取文件
    const absolutePath = resolve(process.cwd(), filePath)
    const markdown = readFileSync(absolutePath, 'utf-8')
    console.log(`📖 读取文件: ${absolutePath}`)

    // 动态导入 marked
    const { marked } = await import('marked')

    // 配置 marked
    marked.setOptions({
      breaks: true,
      gfm: true,
    })

    // 转换为 HTML
    let html = await marked.parse(markdown)
    console.log(`✨ 解析 Markdown 完成`)

    // 应用样式
    if (useInline) {
      html = applyInlineStyles(html, theme)
      console.log(`🎨 应用内联样式，主题色: ${theme.primary}`)
    } else {
      html += generateBaseCSS(theme)
      console.log(`🎨 应用 CSS 样式，主题色: ${theme.primary}`)
    }

    // 复制到剪贴板
    const clipboardy = await import('clipboardy')
    await clipboardy.default.write(html)

    console.log(`✅ 已复制到剪贴板！`)
    console.log('')
    console.log('提示: 直接在微信公众号后台粘贴即可。')

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ 文件不存在: ${filePath}`)
    } else if (error.code === 'MODULE_NOT_FOUND') {
      console.error(`❌ 请先安装依赖: pnpm install`)
      console.error(`💡 在项目根目录运行: pnpm install`)
    } else {
      console.error(`❌ 错误:`, error.message)
    }
    process.exit(1)
  }
}

export default main
