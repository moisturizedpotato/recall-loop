# Recall Loop

Recall Loop is a local LLM-based study helper that turns questions you got wrong into small, editable review cards. It is a local-first study tool, not a chatbot: it drafts one concept, explanation, hint, recall question, and expected answer from the mistake you enter.

## Run it

Requirements: Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Open the localhost URL printed by Vite. To create and serve a production build:

```bash
npm run build
npm run preview
```

`npm run lint` runs Oxlint.

## Local AI setup

AI is optional. In **Settings**, choose **Set up local model** to initialize WebLLM in a browser worker. The app uses the prebuilt WebLLM model `Llama-3.2-1B-Instruct-q4f16_1-MLC` from `@mlc-ai/web-llm` 0.2.x. Its prebuilt model record estimates about 879 MB of VRAM; the model and runtime artifacts require a large first download and setup may take a while. Progress and initialization errors are shown in Settings.

Use a recent browser that supports WebGPU, a compatible GPU/driver, and a secure context (HTTPS or localhost). Browser support and available GPU memory vary. If WebGPU is missing or setup fails, cards can still be created and reviewed manually. An offline browser can use model files already cached on that origin, but it cannot fetch missing files.

WebLLM stores model artifacts in the browser Cache API by default. Browsers can evict cached files, so the model may need to be downloaded again. Study data and model files use separate browser storage.

## Privacy and saved data

- Saved questions, answers, notes, card content, and review history are stored in IndexedDB in this browser. An unsaved draft remains in the current page only.
- Daily-goal changes, theme, and the study timezone are stored alongside cards and reviews. During an app update, close older Recall Loop tabs if IndexedDB is waiting on them to release the database; the app will show a reload prompt rather than replacing or clearing existing data.
- Generation runs locally with WebLLM and WebGPU. Study content is passed only to the on-device model; it is not sent to an app backend or third-party AI API.
- The browser downloads public model/runtime artifacts from their configured hosting locations during setup. Those downloads do not contain the student’s study content.
- There is no account, analytics, sync, or server-side study-data storage. Data is local to this browser and origin; clearing browser site data or changing devices can remove or strand it.
- **Settings → Export data** downloads cards, review history, preferences, daily goal changes, and study timezone as JSON. **Delete all data** clears the app’s saved study data and preferences from IndexedDB; it does not clear WebLLM’s model cache.

## Review behavior

New cards are due immediately. After a review, **Again** schedules tomorrow, **Hard** in three local calendar days, and **Remembered** in seven local calendar days. The daily goal is separate from this schedule: completing a review means attempting or thinking through the recall question, revealing the saved answer, and choosing Again, Hard, or Remembered. A card contributes at most once to that day’s goal, even if it is reviewed repeatedly; every attempt still counts in review history and updates the spaced-repetition schedule.

The goal defaults to five distinct cards per day and can be set from one to 20. When fewer cards are due than the remaining goal, the student can practice saved cards early; those reviews count toward the goal but do not change the early-practiced card’s next review date. Goal changes are scheduled for tomorrow, so they never alter a past day’s target or streak.

The streak is based on explicit study activity, independently of the daily review-card goal. On Home, create a task by entering a subject and the number of questions you plan to solve; mark it complete only after finishing. A saved task can be completed once per study day, including on later days. Creating a new review card also counts as streak activity. Merely creating an unfinished task or reviewing existing cards does not count. Today stays in progress until the local study day ends. If the prior day had no completed task or newly created card, the current streak is reset and the app reminds the student that it broke. Only the current streak is shown; there is no longest-streak counter.

The app stores the study timezone selected on first use and uses that fixed timezone for study dates, goals, due dates, and streaks, so changing the device timezone does not move existing history. Study tasks, their completion dates, cards, and reviews remain in local IndexedDB and are included in export/delete.

The Appearance setting supports System, Light, and Dark themes. System follows the browser’s current operating-system color preference.

## Limitations

- AI text is an unverified draft, not an answer key. The model is prompted to preserve the supplied answer, ground explanations in the question and notes, and avoid unsupported theories; WebLLM JSON mode constrains output to the required card fields. Neither prompting nor schema validation can guarantee factual correctness: check every explanation against your study materials and edit or remove unsupported claims before saving. The app reports truncated output separately.
- The small local model’s generation quality and speed depend on the device. It may return malformed output; retry or use manual card creation.
- WebGPU availability, memory limits, cache persistence, and browser storage quotas are controlled by the browser and device. There is no cross-device backup except the JSON export.

## Implementation references

- WebLLM [Basic Usage](https://webllm.mlc.ai/docs/user/basic_usage.html) documents asynchronous model loading/progress and local chat completions. The package’s [Dedicated Web Worker guide](https://github.com/mlc-ai/web-llm#dedicated-web-worker) documents the worker handler and `CreateWebWorkerMLCEngine` used here.
- The currently installed WebLLM package’s [`prebuiltAppConfig`](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts) is the source of truth for supported prebuilt model IDs.
