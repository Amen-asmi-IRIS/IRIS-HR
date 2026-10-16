# Guide for HR

The HR desk is your workspace. Your own leave, balance and profile are in My space, like everyone's. You never
decide your own request: another HR holder does, or an executive when you are the only one.

## Every day: the desk

| Queue | What is in it | What you do |
|---|---|---|
| To validate | Requests the manager approved (and sick leaves, which come to you directly) | Approve, refuse with a reason, or send back with a comment |
| Certificates | Sick leaves with no certificate: overdue, and due soon | Attach the certificate the employee gave you; or count the days as annual leave; or refuse |
| Stuck with a manager | Requests a manager has not decided after four working days (the delay of the step), or whose manager cannot act (left, no account, account disabled) | Record the decision the manager gave you; give the step to someone else; decide it yourself once it is flagged; name a delegate for that manager |
| Profile changes | Changes employees propose to their own details | Accept or refuse; the record changes when you accept |

A queue with nothing in it says so in one line. No request is ever approved by the passing of time.

## Validate a request

The line shows who, the type, the dates, the count and the state of the document. Opening it shows the balance
now and after, the manager's decision and comment, and the files. The check against the balance is made again
at the moment you approve.

- **Approve**: the request is final. Annual leave is deducted from the balance, one line per month it touches.
- **Refuse**: a reason is required; the employee reads it.
- **Send back**: a comment is required; the employee corrects and sends again, and the steps start over.

## Sick leave

The employee declares, on the day or afterwards. The manager is informed and decides nothing. The certificate is
due 48 hours after the declaration; the employee is reminded 12 hours before, and you are told when it is overdue.
The comment and the certificate are seen by the employee and by HR only: not the manager, not executives, and they
appear in no notification, report or export.

- **Count as annual leave** turns the whole declaration into annual leave. The balance is checked; if it is short
  you may allow an exception with a reason.
- An extension is a new declaration that follows the first.

## When the decision was given outside the system

Open the request, "Record a decision made outside the system": who decided (the manager by default), the outcome,
when, how (verbally or on paper), a note (required), and the scan of the signed form if there is one. The history
shows that you recorded it and for whom.

## Enter a request for an employee

Requests, "New request for an employee". Choose the employee, then the form is theirs. "Allow an exception", with
a reason, lifts the balance, the weekly limit, the days of an event and the rule on past dates. The request then
follows its normal steps, and the employee is told in the application that a request was sent in their name. An
employee cannot change or resend a request you entered with an exception; they can withdraw it.

## Correct, shorten or cancel

Any request, even one that has started or ended: open it, "Correct, shorten or cancel", give the new dates or
cancel, and a reason (required). The employee and the manager are told. Days given back return to the balance.
On a sick leave the reason is used once and stored nowhere that can be read again: the activity log records only
that one was given.

## Employees

- **New employee**: number, name, professional address (`@impactrisks.com`), department, position, manager,
  contract. Enter managers before the people who report to them. Then tell the System Administrator, who creates
  the account; the Status page of the administrator lists employees with no account.
- **Documents**: add a file to the record and choose whether the employee sees it.
- **A departure**: "Record a departure", with the leaving date and a reason. The page lists what follows before you
  confirm: the account is disabled, no credit is posted after the leaving date, requests left open, and the people
  who need a new manager. A record is never deleted; people who left are found with the filter "left".
  When the leaving date is in a month already credited, the credits already posted stay: check the balance history
  and adjust it. A person who comes back needs a new record (and a new account under another address).

## Balances

The balance is the sum of the lines of the history: opening balance, month-end credits, leave taken, days given
back, your adjustments. Nothing is ever edited or deleted; a correction is a new line with its reason.

- **Opening balance**: once per employee, on their record, dated the day before the system starts counting (the
  sheet proposes that date). It is offered only to people hired before that date: someone hired later starts from
  their monthly credits, and days they bring are an adjustment.
- **Month-end credit**: 2.5 days for each month, posted in the first hour after the month's last day and dated that
  day; pro-rated in the month someone joins or leaves, rounded to the nearest half day (a tie rounds up). It starts
  from the date in Settings, Parameters, "credits start on".
- **Adjust**: days to add or remove, a date, a reason. The employee is told and sees the line. You may adjust your
  own balance and enter your own opening balance; each executive is then told, with the amount and the reason.

## The KPMG export

Reports, "KPMG export". Without a payroll cut-off day the page proposes the last calendar month that is over (on
3 December: November); with one, the payroll period just closed. One Excel file, one line per employee: number,
name, department, days of annual, sick and exceptional leave, permission hours, remote days, annual balance at the
end of the period, meal tickets. The data is on the first sheet; when the balance counts month-end credits not
posted yet, a second sheet, "Notes", says so.

- Only approved requests count; a request that crosses the period counts only for the days inside it.
- Meal tickets: 21 for each whole month of the period (at least one), less one for each date on which annual,
  sick or exceptional leave adds up to a full day. Remote days do not reduce them. Joiners and leavers get the
  full base.
- The file holds no comment and nothing medical. Each export is written in the activity log.

## Reports and the activity log

Six reports: absences taken, balances at a date, requests waiting, permission hours by month, remote days by
month, certificates outstanding. Each has its filters and an Excel export of what is shown. The activity log
shows who did what, on what and when, with the values before and after; the content of a sick-leave comment
appears only as "changed".

## Settings

| Subject | Note |
|---|---|
| Request types | A change applies to requests sent afterwards. A type in use is deactivated, not removed |
| Steps of a type | Who acts at each step, and after how many working days a reminder and an alert are sent. At least one step must decide |
| Exceptional-leave events | Name in both languages, days allowed, whether a proof is required |
| Public holidays | By year. "Copy to next year" copies the fixed dates. Changing a holiday does not change requests already approved: the page lists them, and you correct them |
| Parameters | Monthly credit, working days, certificate deadline and warning, meal tickets per month, payroll cut-off day, the date credits start on |
| Departments and positions | An item in use is deactivated, not removed |

## Each December

Enter next year's public holidays (copy the fixed ones, add the others), before employees plan January.
