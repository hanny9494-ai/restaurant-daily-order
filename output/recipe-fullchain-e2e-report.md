# Recipe Fullchain E2E Report

Base URL: https://restaurant-daily-order.vercel.app
Actor: owner@restaurant.local
Reviewer: manager@restaurant.local
Generated: 2026-03-20T16:38:56Z
Runtime: {"data": {"recipe_store": {"mode": "persistent", "provider": "postgres", "reason": "当前食谱主链已切换到 Postgres 持久数据库。", "data_dir": "", "recipes_db_file": "", "l0_db_file": ""}, "postgres": {"configured": true, "provider": "marketplace-postgres", "connection_source": "POSTGRES_URL", "reason": "已检测到 Vercel Marketplace Postgres 连接变量。"}}}

## composite_lobster_text
- label: 复合菜 / Components 文本
- ok: False
- import_status: 200
- import_count: 4
- mode: COMPOSITE
- confirm_status: 200
- created_count: 5
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["import count too low 4", "submit failed 400 INVALID_STAGE"]

## basic_library_text
- label: 基础库 / 多个 backbone 文本
- ok: False
- import_status: 200
- import_count: 3
- mode: ELEMENT_LIBRARY
- confirm_status: 200
- created_count: 3
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["submit failed 400 INVALID_STAGE"]

## cookbook_caviar
- label: Cookbook 复合菜 / Caviar
- ok: False
- import_status: 200
- import_count: 3
- mode: COMPOSITE
- confirm_status: 200
- created_count: 4
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["submit failed 400 INVALID_STAGE"]

## csv_components
- label: CSV 组件导入
- ok: False
- import_status: 200
- import_count: 2
- mode: ELEMENT_LIBRARY
- confirm_status: 200
- created_count: 2
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["submit failed 400 INVALID_STAGE"]

## markdown_single
- label: Markdown 表格单元素
- ok: False
- import_status: 200
- import_count: 1
- mode: SINGLE_ELEMENT
- confirm_status: 200
- created_count: 1
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["submit failed 400 INVALID_STAGE"]

## docx_lobster
- label: DOCX / Lobster
- ok: False
- import_status: 200
- import_count: 5
- mode: COMPOSITE
- confirm_status: 200
- created_count: 6
- submit_status: 400
- review_status: 200
- publish_status: 200
- errors: ["submit failed 400 INVALID_STAGE"]

## single_element_direct
- label: 单个 Element 直接录入
- ok: True
- create_status: 201
- submit_status: 200
- review_status: 200
- publish_status: 200

