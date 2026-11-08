# Dependency advisory inventory

Source: npm audit before remediation; registry results checked on 2026-11-06. Every advisory identifier links to its original record. Reachability and mitigation analysis is in the main certification report.

| Package | Installed before / local after | Severity | Advisory | Vulnerable range |
| --- | --- | --- | --- | --- |
| body-parser | 2.3.0 / 2.4.0 | high | [GHSA-27r3-jxmh-p828: body-parser vulnerable to Denial of Service via trailing bytes after a compressed request body](https://github.com/advisories/GHSA-27r3-jxmh-p828) | `>=2.0.0 <2.4.0` |
| multer | 2.2.0 / 2.5.0 | high | [GHSA-wc9g-mqfw-jrwm: multer vulnerable to Denial of Service via crafted multipart field names](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm) | `<2.3.0` |
| multer | 2.2.0 / 2.5.0 | high | [GHSA-qfvm-cv95-jqjf: multer vulnerable to Denial of Service via file descriptor leak on aborted uploads](https://github.com/advisories/GHSA-qfvm-cv95-jqjf) | `=2.2.0` |
| multer | 2.2.0 / 2.5.0 | low | [GHSA-qvfw-j98x-7q72: multer vulnerable to file size limit bypass via async fileFilter race condition](https://github.com/advisories/GHSA-qvfw-j98x-7q72) | `<2.3.0` |
| multer | 2.2.0 / 2.5.0 | high | [GHSA-535w-7cp7-47q4: multer vulnerable to Denial of Service via oversized array index in field names](https://github.com/advisories/GHSA-535w-7cp7-47q4) | `<2.3.0` |
| multer | 2.2.0 / 2.5.0 | moderate | [GHSA-3pph-fpjx-jg34: multer vulnerable to Denial of Service via orphaned disk writes on aborted uploads](https://github.com/advisories/GHSA-3pph-fpjx-jg34) | `>=2.2.0 <2.4.0` |
| multer | 2.2.0 / 2.5.0 | high | [GHSA-q7qp-rjg7-q26m: multer vulnerable to Denial of Service via a pending asynchronous fileFilter after request teardown](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) | `>=2.0.0 <2.5.0` |
| proxy-addr | 2.0.7 / 2.0.8 | critical | [GHSA-jqcg-44mw-7w3h: proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | `>=1.1.0 <2.0.8` |
| qs | 6.15.3 / 6.17.1 | moderate | [GHSA-x5fp-wj9c-mxmx: qs array-limit bypass via bracket-key comma parsing](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | `>=6.14.2 <=6.15.3` |
| qs | 6.15.3 / 6.17.1 | moderate | [GHSA-4mjr-xmp4-gh2g: qs: Denial of Service via Attacker Controlled isBuffer](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | `>=2.2.5 <6.16.0` |
| qs | 6.15.3 / 6.17.1 | moderate | [GHSA-6pq8-jhm2-2vcw: qs : qs.stringify with arrayFormat 'comma' throws an uncaught TypeError on array elements carrying a non-callable own toString (DoS)](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) | `>=6.7.0 <=6.16.0` |
| uuid | 9.0.1 / 9.0.1 | moderate | [GHSA-w5hq-g745-h8pq: uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | `<11.1.1` |
| zod | 4.6.5 / 4.6.7 | high | [GHSA-mrhx-c7xc-m3w5: Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | `<4.6.6` |
