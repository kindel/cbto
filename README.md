# cbto

An interactive app that walks you through the CBTO stack rank so you can see your superpowers, your growth edge, and whether your current energy matches where it should go. Also teaches the four-lens model.

## The Four Lenses

- **C**ustomer (also called Product): Who you serve and what they need.
- **B**usiness (also called Strategy, or in older writing, Industry): How the company wins.
- **T**echnology (also called Execution): How things get built and shipped.
- **O**rganization (also called People): The humans who build and how they work together.

## The Exercise

The stack rank asks three questions:

1. **Current Strengths**: What are you strongest at today? Rank all four, strongest to weakest. This is your superpower stack.
2. **Future Energy**: Where should you be putting energy over the next 5-10 years? Rank all four by where growth matters most.
3. **Role Alignment**: What does your current role (or manager, or team) actually need? Rank all four by importance to the job.

Compare the three stacks. Gaps reveal where your energy is defaulting to what you are already good at, and where intentional growth will pay off.

Most leaders default to what they are already good at, not what matters most or what brings them joy. Significant development is not only patching weakness. It is aligning growth with work that is fun, future roles, team needs, and market demands.

## Origin

Tig Kindel derived CBTO from J Allard's BXT (Business + eXperience + Technology). Customer always comes first. Experience is a means, not the end. BXT missed the people who build and how they are organized.

## The app

A static page, vanilla JS, no build step. It walks the three ranks, asks an optional joy-or-drain question, and reads the stacks back: your superpower, your growth edge, whether the energy matches the role, and where the job needs most what you have least. The reading is rule-based and deterministic; the same stacks always read the same way. See DESIGN.md for the full design.

Results encode into the URL, so a permalink reproduces them, and past runs are kept in the browser's localStorage so a retake months later shows what moved. Nothing you enter leaves the browser.

### Run

Needs a static file server because the data is loaded with `fetch`.

```
python3 -m http.server
```

Open http://127.0.0.1:8000/

### Host configuration

The default data URLs are relative to the page. A host that mounts cbto elsewhere can override them by setting `window.CBTO` in an inline script *before* `js/cbto.js` loads:

```html
<script>
  window.CBTO = {
    lenses: "/cbto/data/lenses.json",
    interpretations: "/cbto/data/interpretations.json"
  };
</script>
```

### Check

```
node scripts/check_reading.js
```

Lifts the model functions out of `js/cbto.js` rather than restating them, so the check cannot fall out of step with what the page runs. It verifies that every one of the 13,824 stack combinations produces a complete reading, that permalinks round-trip, that the lens data has the required shape, and that no banned word appears in the repo. CI runs it on every push.

## Status

Live at https://kindel.com/cbto/.

## Teaching

The model and the exercise are explained in these posts:

- [Customer, Business, Technology, Organization (CBTO)](https://blog.kindel.com/2018/04/21/customer-business-technology-organization-cbto/) (2018 primer)
- [Your Leadership Priorities Are Probably Backwards (And How to Fix Them)](https://blog.kindel.com/2025/05/08/your-leadership-priorities-are-probably-backwards-and-how-to-fix-them/) (2025 stack rank exercise)

## Related

- [Stop Answering the Wrong Question: Unlock Your True Work Happiness](https://blog.kindel.com/2025/02/05/stop-answering-the-wrong-question-unlock-your-true-work-happiness/) (Joy vs Drain; related, not this app)
- [Mental Models](https://blog.kindel.com/2019/06/22/mental-models/)
- [Office Hours](https://kindel.com/officehours/)

## License

MIT. Copyright (c) 2026 Kindel, LLC. Keep the copyright notice and permission notice in all copies.
