# bunchan-tokyo.github.io

公開サイト（GitHub Pages）と、Cloudflare Pages 本番ソースの置き場。

## ルート側 = GitHub Pages でそのまま遊べるもの
- `index.html` — トップページ
- `belt-action/` — ベルトスクロールアクション
- `tomoshibi/` — 灯火の語り部（GitHub Pages版。Groqキーを自分で入れる方式）

## cloudflare/ = Cloudflare Pages 本番のソース
GitHub Pages では動かない（プロキシ関数が必要）ため、ここは保管専用。
デプロイは wrangler で各プロジェクトへ直接行う。
- `cloudflare/tomoshibi/` → https://tomoshibi-2xz.pages.dev/
- `cloudflare/kanochi/` → https://kanochi-3b1.pages.dev/

どちらも `functions/api/groq.js` が Groq へのプロキシ。
APIキーはコードに含まれず、Cloudflare 側のシークレットにのみ存在する。
