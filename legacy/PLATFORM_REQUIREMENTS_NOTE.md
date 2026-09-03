# SHAN POS SYSTEMS - Platform Requirements Note

This package is for one SHAN POS SYSTEMS platform with three access methods:

- Web browser access
- Mobile app access
- Desktop installed app access

These are not separate products. They must use the same shop account, same Firebase Project ID, same Google Drive backup folder, same shop code, same permissions, same billing history, same stock, same customers, and same reports.

## Master Control

The Master Account controls all customer shop accounts. Every sold shop account must be created from Master Control with:

- Firebase Project ID
- Google Drive Folder ID / backup folder ID
- Shop or company name
- Owner name
- Owner phone
- Owner email when available
- Business address
- Business type
- Shop/account code
- Initial username and PIN
- Package and feature permissions
- Demo/trial status and trial days
- Subscription/payment status
- Generated shop link
- Generated activation code

The generated shop code and activation code identify whether the shop is active, suspended, disabled, paid, expired, demo, or last used.
Customer software uses a Master-issued activation key. License tiers are long-term durations: Normal 1 Year, VIP 5 Years, VIP Plus 10 Years, VIPS 25 Years, Super VIP 35 Years, and Super VIP Premier Unlimited. First Purchase remains a separate 18-month activation flow.

## Optional Feature Ticks

The Master Account decides feature access with permissions/ticks. Important package-level ticks include:

- Demo Version
- Interest Loans
- CCTV Installation Package
- Bank / Finance Records
- Bill Payment
- Invoice
- Quotation
- Job Note
- Backup / Restore
- Opening / Closing Balance

Demo, CCTV, Interest Loans, and Bank/Finance are not separate account creation flows. They are package permissions on the same customer shop account.

## Bank / Finance Meaning

Bank and Finance are internal records for the shop. They are not for selling the software to banks or finance companies.

Bank records are for the shop's own bank accounts, current accounts, deposits, withdrawals, transfers, cheque issued, cheque received, balances, and reports.

Finance records are for the shop's own loans, leasing agreements, assets, installments, paid amounts, balances, and reports.

## Printing

Existing printer support must be preserved. Bluetooth printing is controlled through the mobile phone/mobile printer app path, such as RawBT/PT-210 support. Desktop printing handles A4/system/thermal printer paths.

## Data and Updates

All customer shop data must remain shop-specific. Backups must not mix with another shop. Core software updates made by the owner must be able to reach all customer accounts without removing existing verified features.

## Code Maintenance Rule

Do not hide old errors by adding duplicate override code. Remove the broken root code path and keep one working implementation for navigation, profile, login, permissions, printing, and backup flows.
