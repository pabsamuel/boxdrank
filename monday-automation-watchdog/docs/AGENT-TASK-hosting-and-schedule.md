# Task 2 for an agent with monday.com access

**This is a reading task, not a building task.** Do not create the app, do not
deploy anything, do not change account settings. The code being asked about
lives in a repository you do not have; the job here is to find out what the
platform actually offers so that code can be written correctly.

**Quote documentation verbatim. Do not summarise it.** A paraphrase of an API
signature is worse than nothing, because it looks like a fact and cannot be
checked. If you are inferring rather than reading, say so on that line.

---

## Question 0 — the one that matters most

**Can monday run a job on a schedule, server-side, with no user present?**

The product is a watchdog: it must check an account roughly daily and send an
email when an automation has gone quiet. A page that only runs when someone
opens it is useless for that, because the entire premise is that nobody is
looking.

So, specifically:

- Does **monday code** support scheduled or cron-style execution? If yes, quote
  how a schedule is declared and what the minimum interval is.
- If it does not, what does monday offer instead — webhooks, a recurring
  automation that calls an app, a queue, anything?
- If there is genuinely nothing, say so plainly. **That is a valid and useful
  answer**, and it is better delivered now than discovered after a build.

Everything below is secondary to this.

## Question 1 — monday code

- Does monday code still exist and is it free? Quote any pricing or limits.
- How is an app deployed to it — CLI, upload, git? Name the exact command if
  there is one.
- **Storage API:** the exact method names and signatures for reading and writing
  key/value data from a server-side app. Quote the code sample.
- Is stored data scoped per account automatically, or does the app namespace it?

## Question 2 — app features and configuration

- Where are an app's features defined — a manifest file in the repo, or only in
  the Developer Center UI? If a file, quote a complete example.
- What exactly does a **Board View** feature need in order to be added?
- Is there a feature type for a **scheduled or background job**? Open the
  Developer Center's "add feature" UI and list every feature type it offers,
  verbatim.

## Question 3 — OAuth scopes

- Quote the **full list of available scopes**, with their exact names.
- Which scope is required to read `boards` and `activity_logs`?
- Which scope is required to read the account's `users`?
- Is there a read-only scope, or does the boards scope include writing?

The app is read-only and wants the minimum possible set, because every extra
scope is a question at marketplace review.

## Question 4 — sending email

- Can an app send email through monday, or must it use an outside provider?
- If an outside provider is required, does monday's review process place any
  constraint on which one, or on where the app may send data?

## Output format

For each question, give:

```
Q<n>: <one-line answer>
Source: <URL of the page, or "Developer Center UI" with the screen name>
Verbatim:
> <the actual quoted text or code sample>
```

If something cannot be found, write `NOT FOUND` and say where you looked. An
honest gap is useful. An invented answer costs a rewrite.

## Do not

- Do not paste the account's API token anywhere.
- Do not create, deploy or delete an app.
- Do not install anything from the marketplace.
- Do not guess at a method signature. If you did not read it, say so.
