# 自造样本快速自动测试结果

- 日期: 2026-03-21 01:58:10
- 环境: https://restaurant-daily-order.vercel.app
- runtime: persistent / postgres
- 操作人: owner@restaurant.local
- 审批/发布人: manager@restaurant.local

## 总结

- 通过: 5/5
- 失败: 0/5

## 单个 Element / Brown Butter Sauce

- 结果: PASS
- import: PASS (200) - count=1
- confirm+submit: PASS (200) - created=1 submitted=1
- detail:301: PASS (200) - ELEMENT ing=3 step=3
- review:305: PASS (200) - approved
- publish:305: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- cleanup: PASS (301:200)

## 基础库 / 多个 Backbone

- 结果: PASS
- import: PASS (200) - count=3
- confirm+submit: PASS (200) - created=3 submitted=3
- detail:302: PASS (200) - ELEMENT ing=2 step=3
- detail:303: PASS (200) - ELEMENT ing=3 step=4
- detail:304: PASS (200) - ELEMENT ing=1 step=3
- review:306: PASS (200) - approved
- publish:306: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:307: PASS (200) - approved
- publish:307: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:308: PASS (200) - approved
- publish:308: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- cleanup: PASS (302:200, 303:200, 304:200)

## Components 复合菜 / Lobster

- 结果: PASS
- import: PASS (200) - count=5
- confirm+submit: PASS (200) - created=6 submitted=6
- detail:310: PASS (200) - COMPOSITE comp=5 step=1
- detail:305: PASS (200) - ELEMENT ing=3 step=3
- detail:306: PASS (200) - ELEMENT ing=3 step=3
- detail:307: PASS (200) - ELEMENT ing=2 step=2
- detail:308: PASS (200) - ELEMENT ing=2 step=3
- detail:309: PASS (200) - ELEMENT ing=1 step=2
- review:314: PASS (200) - approved
- publish:314: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:309: PASS (200) - approved
- publish:309: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:310: PASS (200) - approved
- publish:310: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:311: PASS (200) - approved
- publish:311: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:312: PASS (200) - approved
- publish:312: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:313: PASS (200) - approved
- publish:313: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- cleanup: PASS (310:200, 305:200, 306:200, 307:200, 308:200, 309:200)

## Cookbook 复合菜 / Caviar

- 结果: PASS
- import: PASS (200) - count=3
- confirm+submit: PASS (200) - created=4 submitted=4
- detail:314: PASS (200) - COMPOSITE comp=3 step=3
- detail:311: PASS (200) - ELEMENT ing=2 step=3
- detail:312: PASS (200) - ELEMENT ing=2 step=3
- detail:313: PASS (200) - ELEMENT ing=4 step=3
- review:318: PASS (200) - approved
- publish:318: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:315: PASS (200) - approved
- publish:315: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:316: PASS (200) - approved
- publish:316: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- review:317: PASS (200) - approved
- publish:317: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- cleanup: PASS (314:200, 311:200, 312:200, 313:200)

## 直接创建单个 Element

- 结果: PASS
- create: PASS (201) - created
- detail: PASS (200) - ELEMENT ing=2 step=1
- submit: PASS (200) - submitted
- review: PASS (200) - approved
- publish: PASS (200) - BANGWAGONG_WEBHOOK_URL_NOT_SET
- cleanup: PASS (315:200)
