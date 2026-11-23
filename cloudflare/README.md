# Cloudflare Pages 本番ソース

- `tomoshibi/` — 灯火の語り部 → プロジェクト `tomoshibi`（tomoshibi-2xz.pages.dev）
- `kanochi/` — 完落ち → プロジェクト `kanochi`（kanochi-3b1.pages.dev）

各ディレクトリを `wrangler pages deploy` でデプロイする。
Groq APIキーは両プロジェクト共通で、シークレット `GROQ_API_KEY` に登録（コードには書かない）。
