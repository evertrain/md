#!/usr/bin/env node

/**
 * md-cli copy-browser command
 * 使用 Puppeteer 启动浏览器，模拟页面点击复制
 * 用法: md-cli copy-browser <file.md> [选项]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { parseArgv } from './util.js'
import puppeteer from 'puppeteer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 解析命令行参数
function parseArgs() {
  // 从 process.argv 获取文件路径 (copy-browser 命令后的第一个参数)
  const filePath = process.argv[3]

  if (!filePath) {
    console.error('用法: md-cli copy-browser <文件路径> [选项]')
    console.error('示例: md-cli copy-browser article.md')
    console.error('')
    console.error('选项:')
    console.error('  --port=<port>     服务器端口 (默认: 8899)')
    process.exit(1)
  }

  const args = parseArgv()
  const port = args['--port'] || 8899

  return { filePath, port }
}

/**
 * 创建修改后的 index.html，移除外部依赖并修复路径
 */
function createModifiedIndexHtml(distPath) {
  const indexPath = resolve(distPath, 'index.html')
  let html = readFileSync(indexPath, 'utf-8')

  // 移除 Google Analytics
  html = html.replace(/<script src="https:\/\/www\.googletagmanager\.com\/gtag\/js[^"]*"><\/script>/g, '')
  html = html.replace(/<script>\s*window\.dataLayer[\s\S]*?<\/script>/g, '')

  // 替换 MathJax 为本地版本
  html = html.replace(
    /src="https:\/\/cdn-doocs\.oss-cn-shenzhen\.aliyuncs\.com\/npm\/mathjax@3\/es5\/tex-svg\.js"/,
    'src="/md/vendor/mathjax.min.js"'
  )

  // 替换 Mermaid 为本地版本
  html = html.replace(
    /src="https:\/\/cdn-doocs\.oss-cn-shenzhen\.aliyuncs\.com\/npm\/mermaid@11\/dist\/mermaid\.min\.js"/,
    'src="/md/vendor/mermaid.min.js"'
  )

  // 移除 WeChat Sync（不需要）
  html = html.replace(
    /<script src="https:\/\/cdn-doocs\.oss-cn-shenzhen\.aliyuncs\.com\/gh\/wechatsync\/article-syncjs@latest\/dist\/main\.js"><\/script>/,
    ''
  )

  return html
}

/**
 * 创建静态文件服务器
 */
function createStaticServer(port, distPath) {
  const app = express()

  // 提供 vendor 目录（挂载在 /md/vendor 下）
  app.use('/md/vendor', express.static(resolve(distPath, 'vendor')))

  // 提供修改后的 index.html
  app.get('/', (req, res) => {
    const modifiedHtml = createModifiedIndexHtml(distPath)
    res.type('html').send(modifiedHtml)
  })

  // 提供静态文件（挂载在 /md 下）
  app.use('/md', express.static(distPath))

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '127.0.0.1', () => {
      console.log(`📦 本地服务已启动: http://127.0.0.1:${port}`)
      resolve(server)
    })
    server.on('error', reject)
  })
}

/**
 * 主函数
 */
async function main() {
  const { filePath, port } = parseArgs()

  let server = null
  let browser = null

  try {
    // 读取文件
    const absolutePath = resolve(process.cwd(), filePath)
    const markdown = readFileSync(absolutePath, 'utf-8')
    console.log(`📖 读取文件: ${absolutePath}`)

    // 启动静态服务器
    const distPath = resolve(__dirname, '../../apps/web/dist')
    server = await createStaticServer(port, distPath)

    // 启动浏览器
    console.log(`🚀 启动浏览器...`)
    browser = await puppeteer.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    const page = await browser.newPage()

    // 设置视口大小
    await page.setViewport({ width: 1280, height: 800 })

    // 拦截外部请求，阻止可能阻塞的内容
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      const url = request.url()
      // 阻止 Google Analytics 等外部跟踪
      if (url.includes('googletagmanager.com') ||
          url.includes('google-analytics.com') ||
          url.includes('gtag')) {
        request.abort()
      } else {
        request.continue()
      }
    })

    // 监听控制台错误
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text()
        // 忽略一些常见的不影响功能的错误
        if (!text.includes('Failed to load resource') &&
            !text.includes('net::ERR')) {
          console.log(`❌ 控制台错误:`, text.substring(0, 200))
        }
      }
    })

    // 打开页面 - 现在服务在 /md/ 路径下
    await page.goto(`http://127.0.0.1:${port}/md/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    })
    console.log(`✨ 页面 DOM 加载完成`)

    // 等待 Vue 应用挂载（loading div 消失或 app 被渲染）
    try {
      await page.waitForFunction(() => {
        const app = document.querySelector('#app')
        if (!app) return false
        // 检查是否还在 loading 状态
        const loading = app.querySelector('.loading')
        if (loading) {
          // 检查 loading 是否可见
          const style = window.getComputedStyle(loading)
          return style.display === 'none' || loading.textContent.includes('正在加载编辑器') === false
        }
        return true
      }, { timeout: 20000 })
      console.log(`✨ Vue 应用已挂载`)
    } catch (e) {
      console.log(`⚠️ Vue 应用挂载超时，继续...`)
    }

    // 额外等待让渲染完成
    await new Promise(r => setTimeout(r, 2000))

    // 截图以便调试
    await page.screenshot({ path: 'debug-screenshot.png' })
    console.log(`📸 截图已保存为 debug-screenshot.png`)

    // 检查页面状态
    const pageInfo = await page.evaluate(() => {
      return {
        hasCmEditor: !!document.querySelector('.cm-editor'),
        hasTextarea: !!document.querySelector('textarea'),
        bodyInnerHTML: document.body.innerHTML.substring(0, 300),
      }
    })
    console.log(`🔍 页面状态:`, JSON.stringify(pageInfo, null, 2))

    // 注入 Markdown 内容到编辑器
    // 直接通过 Vue 组件实例注入
    const injected = await page.evaluate((md) => {
      // 调试信息
      window._debugInfo = {}

      // 找到 Vue app 实例
      const app = document.querySelector('#app')?.__vue_app__
      if (!app) {
        window._debugInfo.error = 'No Vue app found'
        return false
      }

      // 尝试通过 EditorView 的 DOM 挂载点找到 view
      // CodeMirror 6 将 view 实例存储在 DOM 元素的 _cmView 属性上
      const cmDom = document.querySelector('.cm-editor')
      if (cmDom) {
        window._debugInfo.cmDomFound = true
        window._debugInfo.cmDomKeys = Object.keys(cmDom)
        window._debugInfo.cmDomHas_cmView = '_cmView' in cmDom
        window._debugInfo.cmDomHas_view = 'view' in cmDom

        if (cmDom._cmView) {
          const view = cmDom._cmView
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: md
            }
          })
          window._debugInfo.used_cmDom__cmView = true
          return true
        }

        // CodeMirror 6 使用 data-* 属性存储状态
        for (let i = 0; i < 100; i++) {
          const key = `data-cm-${i}`
          if (cmDom[key]) {
            window._debugInfo[key] = cmDom[key]
          }
        }
      }

      // 尝试找 EditorView 全局实例
      if (window.__cmView) {
        const view = window.__cmView
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: md
          }
        })
        window._debugInfo.used_window__cmView = true
        return true
      }

      // 尝试通过 Vue 组件实例链查找
      const walkComponents = (instance, depth = 0) => {
        if (!instance || depth > 10) return null
        if (depth <= 3) window._debugInfo[`depth${depth}`] = Object.keys(instance).slice(0, 10)

        // 检查是否是 editor 组件 (通过查看 proxy 对象)
        const proxy = instance.proxy
        if (proxy) {
          const props = Object.keys(proxy)
          window._debugInfo[`depth${depth}_proxy_keys`] = props.slice(0, 20)
          // 尝试找 markdown 或 content 属性
          for (const key of props) {
            if (key.includes('markdown') || key.includes('content') || key.includes('value')) {
              const val = proxy[key]
              if (typeof val === 'string') {
                window._debugInfo.foundStringKey = key
                window._debugInfo.foundStringLen = val.length
                proxy[key] = md
                return true
              }
            }
          }
        }

        // 递归检查子组件
        if (instance.subTree?.component) {
          const child = instance.subTree.component
          const result = walkComponents(child, depth + 1)
          if (result) return result
        }

        return null
      }

      const result = walkComponents(app)
      if (result) {
        window._debugInfo.used_walkComponents = true
        return true
      }

      // 最后的备选方案：直接操作 DOM
      // 找到所有可能的输入元素
      const textareas = document.querySelectorAll('textarea')
      for (const ta of textareas) {
        ta.value = md
        ta.dispatchEvent(new Event('input', { bubbles: true }))
        window._debugInfo.used_textarea = true
        return true
      }

      // CodeMirror 6 的 contenteditable 方式
      const codeMirrorContent = document.querySelector('.cm-content')
      if (codeMirrorContent) {
        codeMirrorContent.textContent = md
        const event = new InputEvent('input', { bubbles: true, inputType: 'insertText' })
        codeMirrorContent.dispatchEvent(event)
        window._debugInfo.used_cmContent = true
        return true
      }

      return false
    }, markdown)

    console.log(`🔍 注入调试信息:`, await page.evaluate(() => window._debugInfo))

    if (injected) {
      console.log(`📝 内容已注入 (Vue/CodeMirror)`)
      // 等待一下让渲染完成
      await new Promise(r => setTimeout(r, 1000))
    } else {
      console.log(`⚠️ 内容注入失败，尝试键盘方式...`)

      // 使用键盘方式注入
      // 1. 点击编辑器让它获得焦点
      const cmEditor = await page.$('.cm-editor')
      if (cmEditor) {
        await cmEditor.click()
        await new Promise(r => setTimeout(r, 500))
      }

      // 2. 全选内容 - 使用组合键
      await page.keyboard.down('Control')
      await page.keyboard.press('a')
      await page.keyboard.up('Control')
      await new Promise(r => setTimeout(r, 200))

      // 3. 使用浏览器 Clipboard API 写入剪贴板（在 page context 中执行）
      await page.evaluate((text) => {
        navigator.clipboard.writeText(text)
      }, markdown)

      // 4. 使用 Command+V 粘贴 (Mac 上 Chrome 使用 Command 键)
      await page.keyboard.down('Meta')
      await page.keyboard.press('v')
      await page.keyboard.up('Meta')
      await new Promise(r => setTimeout(r, 500))
      console.log(`📝 内容已注入 (键盘)`)
    }

    // 等待渲染
    await new Promise(r => setTimeout(r, 2000))

    // 再次检查页面状态
    const pageInfoAfter = await page.evaluate(() => {
      const cmContent = document.querySelector('.cm-content')
      return {
        cmContentText: cmContent?.textContent?.substring(0, 100),
        cmContentLength: cmContent?.textContent?.length || 0,
      }
    })
    console.log(`🔍 注入后内容检查:`, pageInfoAfter)

    // 注入剪贴板监听代码
    await page.evaluateOnNewDocument(() => {
      window._clipboardContent = null
      const originalWrite = window.navigator.clipboard.write
      window.navigator.clipboard.write = async function(items) {
        for (const item of items) {
          if (item.types) {
            for (const type of item.types) {
              if (type === 'text/html') {
                const blob = await item.getType(type)
                window._clipboardContent = await blob.text()
              }
            }
          }
        }
        return originalWrite.call(this, items)
      }
    })

    // 点击复制按钮
    const copyButton = await page.evaluateHandle(() => {
      const buttons = document.querySelectorAll('button')
      for (const btn of buttons) {
        if (btn.textContent && btn.textContent.includes('复制')) {
          return btn
        }
      }
      return null
    })

    if (copyButton) {
      await copyButton.click()
      console.log(`📋 已点击复制按钮`)
    } else {
      console.error(`❌ 未找到复制按钮`)
      // 尝试从 #output 获取内容作为 fallback
      const outputContent = await page.evaluate(() => {
        const output = document.querySelector('#output')
        return output ? output.innerHTML : null
      })
      if (outputContent) {
        console.log(`📋 使用 fallback 方式获取内容`)
        const clipboardy = await import('clipboardy')
        await clipboardy.default.write(outputContent)
        console.log(`✅ 已复制到剪贴板！`)
        console.log('')
        console.log('提示: 直接在微信公众号后台粘贴即可。')
        return
      }
      process.exit(1)
    }

    // 等待剪贴板写入
    await new Promise(r => setTimeout(r, 500))

    // 直接从 #output 元素获取渲染后的 HTML
    // 这是最可靠的方式，因为页面已经完整渲染了内容
    const clipboardContent = await page.evaluate(() => {
      const output = document.querySelector('#output')
      if (output) {
        // 获取 innerHTML
        return output.innerHTML
      }
      return null
    })

    if (clipboardContent) {
      // 写入系统剪贴板
      const clipboardy = await import('clipboardy')
      await clipboardy.default.write(clipboardContent)
      console.log(`✅ 已复制到系统剪贴板！`)
      console.log('')
      console.log('提示: 直接在微信公众号后台粘贴即可。')
    } else {
      console.error(`❌ 无法获取剪贴板内容`)
      process.exit(1)
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ 文件不存在: ${filePath}`)
    } else {
      console.error(`❌ 错误:`, error.message)
    }
    process.exit(1)
  } finally {
    // 清理
    if (browser) {
      await browser.close()
      console.log(`🔒 浏览器已关闭`)
    }
    if (server) {
      server.close()
      console.log(`🛑 服务器已关闭`)
    }
  }
}

export default main
