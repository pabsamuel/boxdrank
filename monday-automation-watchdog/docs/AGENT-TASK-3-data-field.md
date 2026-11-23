# Task 3 — can two automations on one board be told apart?

Small and concrete. Do this one first; Task 2 below is longer reading.

## Why

Verified already: monday automations act under a negative `user_id` (`-4`).
That separates an automation from a person. It does **not** separate one
automation from another — they all share the same id.

An app watching these signals identifies each by
`(board, actor, event, entity)`. Two automations on the same board that both
change a column therefore look like one thing. If one dies while the other keeps
firing, the death is invisible. That is the exact failure the app exists to
catch, so it needs closing.

The activity log has a `data` field that has never been looked at. If it carries
a column id, a group id or an automation id, the two can be separated.

## What to do

Board `5104569213` ("Automation Actor Test") already has two automations on it:

1. the status → move-to-group one created earlier, and
2. "When an item is created, assign item creator as Person".

**1. Fire both, a few times each.**

- Create **three new items** — that triggers the assign-creator automation.
- Change the status on **three items** — that triggers the move automation.
- Leave a few seconds between each. Automations run about 1.5 seconds behind.

**2. Run this query.** The only change from last time is `data`:

```graphql
query {
  boards(ids: [5104569213]) {
    id
    name
    activity_logs(limit: 40) {
      id
      event
      entity
      user_id
      data
      created_at
    }
  }
}
```

**3. Return the raw JSON, unmodified.** `data` is the whole point — do not strip
it, truncate it, or reformat it, even if it is long or looks like escaped JSON
inside a string. Paste it exactly as returned.

**4. One line:** do the two automations' entries differ in anything other than
`event`? Name the field if so.

## Scope

Change nothing except creating items and setting statuses on board
`5104569213`. No new columns, no new boards, no new automations, no
connections to other boards. The previous run added several of those; they were
not asked for.

---

# Task 2 (repeat) — hosting and scheduling

**A reading task.** Do not create the app, do not deploy, do not change account
settings. **Quote documentation verbatim; do not summarise.** A paraphrased API
signature looks like a fact and cannot be checked. Mark any line where you are
inferring rather than reading.

## Question 0 — the one that can invalidate the whole design

**Can monday run a job on a schedule, server-side, with no user present?**

The product must check an account roughly daily and email when an automation has
gone quiet. A page that runs only when someone opens it is useless, because the
premise is that nobody is looking.

- Does **monday code** support scheduled or cron-style execution? If yes, quote
  how a schedule is declared and the minimum interval.
- If not, what does monday offer instead — webhooks, a recurring automation that
  calls an app, a queue, anything?
- If there is genuinely nothing, **say so plainly.** That is a valid and useful
  answer, and far better now than after a build.

## Question 1 — monday code

- Does it still exist, and is it free? Quote any pricing or limits.
- How is an app deployed — CLI, upload, git? Exact command if there is one.
- **Storage API:** exact method names and signatures for server-side key/value
  read and write. Quote the code sample.
- Is stored data scoped per account automatically, or must the app namespace it?

## Question 2 — app features

- Are features defined in a manifest file in the repo, or only in the Developer
  Center UI? If a file, quote a complete example.
- What does a **Board View** feature need in order to be added?
- Is there a feature type for a **scheduled or background job**? Open the
  Developer Center's "add feature" screen and list every type it offers,
  verbatim.

## Question 3 — OAuth scopes

- Quote the **full list of scopes** with exact names.
- Which is required to read `boards` and `activity_logs`?
- Which is required to read the account's `users`?
- Is there a read-only scope, or does the boards scope include writing?

The app is read-only and wants the minimum set; every extra scope is a question
at marketplace review.

## Question 4 — email

- Can an app send email through monday, or is an outside provider required?
- If outside, does monday's review constrain which provider, or where data may
  be sent?

## Output format

```
Q<n>: <one-line answer>
Source: <page URL, or "Developer Center UI" + screen name>
Verbatim:
> <actual quoted text or code sample>
```

`NOT FOUND` plus where you looked is a good answer. **An invented answer costs a
rewrite.**

## Do not

- Do not paste the API token anywhere.
- Do not create, deploy or delete an app.
- Do not install anything from the marketplace.
- Do not guess a method signature. If you did not read it, say so.
