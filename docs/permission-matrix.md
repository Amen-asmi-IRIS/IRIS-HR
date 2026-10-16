# Permission matrix

The access each API route declares, as printed by `python manage.py permission_report`. `tests/hardening/test_access_contract.py` checks it against the master plan, sections 7.1 to 7.11.

| Route | Path | Method | Allowed |
|---|---|---|---|
| `accounts:account-candidates` | `/api/v1/accounts/candidates` | GET | sysadmin |
| `accounts:account-detail` | `/api/v1/accounts/<uuid:public_id>` | GET | exec, sysadmin |
| `accounts:account-disable` | `/api/v1/accounts/<uuid:public_id>/disable` | POST | sysadmin |
| `accounts:account-enable` | `/api/v1/accounts/<uuid:public_id>/enable` | POST | sysadmin |
| `accounts:account-list` | `/api/v1/accounts` | GET | exec, sysadmin |
| `accounts:account-list` | `/api/v1/accounts` | POST | sysadmin |
| `accounts:account-reset-password` | `/api/v1/accounts/<uuid:public_id>/reset-password` | POST | sysadmin |
| `accounts:account-role` | `/api/v1/accounts/<uuid:public_id>/roles/<str:role>` | DELETE | sysadmin |
| `accounts:account-roles` | `/api/v1/accounts/<uuid:public_id>/roles` | POST | sysadmin |
| `accounts:account-unlock` | `/api/v1/accounts/<uuid:public_id>/unlock` | POST | sysadmin |
| `accounts:csrf` | `/api/v1/auth/csrf` | GET | public |
| `accounts:login` | `/api/v1/auth/login` | POST | public |
| `accounts:logout` | `/api/v1/auth/logout` | POST | any signed-in account |
| `accounts:me` | `/api/v1/auth/me` | GET | any signed-in account |
| `accounts:me` | `/api/v1/auth/me` | PATCH | any signed-in account |
| `accounts:password` | `/api/v1/auth/password` | POST | any signed-in account |
| `audit:business` | `/api/v1/audit/business` | GET | hr, exec |
| `audit:business-export` | `/api/v1/audit/business/export` | GET | hr, exec |
| `audit:security` | `/api/v1/audit/security` | GET | exec, sysadmin |
| `audit:security-export` | `/api/v1/audit/security/export` | GET | exec, sysadmin |
| `balances:adjustments` | `/api/v1/balances/<uuid:employee_public_id>/adjustments` | POST | hr |
| `balances:figures` | `/api/v1/balances/<uuid:employee_public_id>` | GET | employee, hr, exec |
| `balances:ledger` | `/api/v1/balances/<uuid:employee_public_id>/ledger` | GET | employee, hr, exec |
| `calendar:feed` | `/api/v1/calendar` | GET | employee, hr, exec |
| `calendar:holiday-copy` | `/api/v1/holidays/copy` | POST | hr |
| `calendar:holiday-detail` | `/api/v1/holidays/<int:pk>` | DELETE | hr |
| `calendar:holiday-detail` | `/api/v1/holidays/<int:pk>` | PATCH | hr |
| `calendar:holiday-impact` | `/api/v1/holidays/impact` | GET | hr |
| `calendar:holiday-list` | `/api/v1/holidays` | GET | employee, hr, exec |
| `calendar:holiday-list` | `/api/v1/holidays` | POST | hr |
| `core:admin-status` | `/api/v1/admin/status` | GET | exec, sysadmin |
| `core:health` | `/api/v1/health` | GET | public |
| `files:download` | `/api/v1/attachments/<uuid:public_id>/download` | GET | any signed-in account |
| `notifications:list` | `/api/v1/notifications` | GET | any signed-in account |
| `notifications:read` | `/api/v1/notifications/<int:pk>/read` | POST | any signed-in account |
| `notifications:read-all` | `/api/v1/notifications/read-all` | POST | any signed-in account |
| `notifications:unread-count` | `/api/v1/notifications/unread-count` | GET | any signed-in account |
| `organisation:delegation-end` | `/api/v1/delegations/<uuid:public_id>/end` | POST | manager, hr |
| `organisation:delegation-list` | `/api/v1/delegations` | GET | manager, hr |
| `organisation:delegation-list` | `/api/v1/delegations` | POST | manager, hr |
| `organisation:department-detail` | `/api/v1/departments/<int:id>` | PATCH | hr |
| `organisation:department-list` | `/api/v1/departments` | GET | hr, exec |
| `organisation:department-list` | `/api/v1/departments` | POST | hr |
| `organisation:employee-archive` | `/api/v1/employees/<uuid:public_id>/archive` | POST | hr |
| `organisation:employee-archive-preview` | `/api/v1/employees/<uuid:public_id>/archive-preview` | GET | hr |
| `organisation:employee-detail` | `/api/v1/employees/<uuid:public_id>` | GET | employee, hr, exec |
| `organisation:employee-detail` | `/api/v1/employees/<uuid:public_id>` | PATCH | hr |
| `organisation:employee-directory` | `/api/v1/employees/directory` | GET | manager, hr, exec |
| `organisation:employee-document` | `/api/v1/employees/<uuid:public_id>/documents/<int:id>` | PATCH | hr |
| `organisation:employee-documents` | `/api/v1/employees/<uuid:public_id>/documents` | GET | employee, hr, exec |
| `organisation:employee-documents` | `/api/v1/employees/<uuid:public_id>/documents` | POST | hr |
| `organisation:employee-history` | `/api/v1/employees/<uuid:public_id>/history` | GET | hr, exec |
| `organisation:employee-list` | `/api/v1/employees` | GET | manager, hr, exec |
| `organisation:employee-list` | `/api/v1/employees` | POST | hr |
| `organisation:employee-me` | `/api/v1/employees/me` | GET | employee |
| `organisation:position-detail` | `/api/v1/positions/<int:id>` | PATCH | hr |
| `organisation:position-list` | `/api/v1/positions` | GET | hr, exec |
| `organisation:position-list` | `/api/v1/positions` | POST | hr |
| `organisation:profile-change-decide` | `/api/v1/profile-changes/<uuid:public_id>/decide` | POST | hr |
| `organisation:profile-change-detail` | `/api/v1/profile-changes/<uuid:public_id>` | GET | employee, hr |
| `organisation:profile-change-list` | `/api/v1/profile-changes` | GET | employee, hr |
| `organisation:profile-change-list` | `/api/v1/profile-changes` | POST | employee |
| `organisation:profile-change-withdraw` | `/api/v1/profile-changes/<uuid:public_id>/withdraw` | POST | employee |
| `reports:home-me` | `/api/v1/home/me` | GET | employee |
| `reports:home-overview` | `/api/v1/home/overview` | GET | exec |
| `reports:home-team` | `/api/v1/home/team` | GET | manager |
| `reports:kpmg-default-period` | `/api/v1/exports/kpmg/default-period` | GET | hr |
| `reports:kpmg-export` | `/api/v1/exports/kpmg` | GET | hr |
| `reports:report` | `/api/v1/reports/<str:name>` | GET | manager, hr, exec |
| `reports:report-filters` | `/api/v1/report-filters` | GET | manager, hr, exec |
| `reports:workspace-summary` | `/api/v1/workspaces/summary` | GET | any signed-in account |
| `requests:amendment-withdraw` | `/api/v1/amendments/<uuid:public_id>/withdraw` | POST | employee |
| `requests:approval-list` | `/api/v1/approvals` | GET | employee, hr, exec |
| `requests:event-detail` | `/api/v1/exceptional-events/<int:pk>` | PATCH | hr |
| `requests:event-list` | `/api/v1/exceptional-events` | GET | employee, hr, exec |
| `requests:event-list` | `/api/v1/exceptional-events` | POST | hr |
| `requests:request-amendments` | `/api/v1/requests/<uuid:public_id>/amendments` | GET | employee, hr, exec |
| `requests:request-amendments` | `/api/v1/requests/<uuid:public_id>/amendments` | POST | employee |
| `requests:request-attachments` | `/api/v1/requests/<uuid:public_id>/attachments` | GET | employee, hr, exec |
| `requests:request-attachments` | `/api/v1/requests/<uuid:public_id>/attachments` | POST | employee, hr |
| `requests:request-cancel` | `/api/v1/requests/<uuid:public_id>/cancel` | POST | hr |
| `requests:request-correct` | `/api/v1/requests/<uuid:public_id>/correct` | POST | hr |
| `requests:request-detail` | `/api/v1/requests/<uuid:public_id>` | DELETE | employee, hr |
| `requests:request-detail` | `/api/v1/requests/<uuid:public_id>` | GET | employee, hr, exec |
| `requests:request-detail` | `/api/v1/requests/<uuid:public_id>` | PATCH | employee, hr |
| `requests:request-history` | `/api/v1/requests/<uuid:public_id>/history` | GET | employee, hr, exec |
| `requests:request-list` | `/api/v1/requests` | GET | employee, hr, exec |
| `requests:request-list` | `/api/v1/requests` | POST | employee, hr |
| `requests:request-preview` | `/api/v1/requests/preview` | POST | employee, hr |
| `requests:request-reclassify` | `/api/v1/requests/<uuid:public_id>/reclassify` | POST | hr |
| `requests:request-submit` | `/api/v1/requests/<uuid:public_id>/submit` | POST | employee, hr |
| `requests:request-withdraw` | `/api/v1/requests/<uuid:public_id>/withdraw` | POST | employee |
| `requests:step-decide` | `/api/v1/steps/<int:pk>/decide` | POST | employee, hr, exec |
| `requests:step-reassign` | `/api/v1/steps/<int:pk>/reassign` | POST | hr |
| `requests:step-record-on-behalf` | `/api/v1/steps/<int:pk>/record-on-behalf` | POST | hr |
| `requests:type-chain-preview` | `/api/v1/request-types/<int:pk>/chain-preview` | GET | hr |
| `requests:type-detail` | `/api/v1/request-types/<int:pk>` | GET | hr, exec |
| `requests:type-detail` | `/api/v1/request-types/<int:pk>` | PATCH | hr |
| `requests:type-list` | `/api/v1/request-types` | GET | employee, hr, exec |
| `requests:type-list` | `/api/v1/request-types` | POST | hr |
| `requests:type-steps` | `/api/v1/request-types/<int:pk>/steps` | GET | hr, exec |
| `requests:type-steps` | `/api/v1/request-types/<int:pk>/steps` | PUT | hr |
| `settings:hr` | `/api/v1/settings/hr` | GET | hr, exec |
| `settings:hr-item` | `/api/v1/settings/hr/<str:key>` | PUT | hr |
| `settings:system` | `/api/v1/settings/system` | GET | exec, sysadmin |
| `settings:system-item` | `/api/v1/settings/system/<str:key>` | PUT | sysadmin |

