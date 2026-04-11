# Medical Bible — User guide

Welcome. This guide is written for **anyone using the app**, not for programmers. If you need technical setup (installing on a server, database steps), see **[DEVELOPERS.md](./DEVELOPERS.md)**.

---

## What is this app?

**Medical Bible** (also called **Medical Tracker** in the project) is a **private notebook for your health**. You use it in a **web browser** on a phone, tablet, or computer. It helps you:

- Remember **pain**, **symptom episodes**, **doctor visits**, **medications**, **tests**, **diagnoses**, and **questions** you want to ask.
- See **simple charts** so patterns are easier to spot over time.
- Build a **written summary** you can read before an appointment or **save as a PDF** to share (for example with a doctor—only if *you* choose to).

It is **not** a replacement for medical care. It does **not** diagnose you or tell you what treatment to do. **You** and your care team make medical decisions.

---

## What you need to use it

1. **Internet** — the app loads from the web and saves your entries to a secure account online.
2. **An account** — usually **email and password** (whoever set up your copy of the app will tell you how to sign up or log in).
3. **The website address (URL)** — the link you open to reach *your* copy of the app (for example a custom link if someone deployed it for you).

Your data is stored in a service called **Supabase** (think of it as a private locker for your account). **Only you** (when logged in) should see your own entries, when the system is set up correctly.

---

## Signing in and staying safe

- Use a **strong password** and do not share it.
- **Log out** if you use a shared computer.
- This app can hold **sensitive health information**. Treat it like any other private medical notes.
- Laws about health data (**HIPAA**, **GDPR**, and others) depend on **who runs the app** and **how** it is hosted. This README is **not legal advice**. If you need formal compliance, talk to a professional.

---

## The home screen (Dashboard)

When you open the app after logging in, you usually land on the **Dashboard**. You may see:

- **Upcoming appointments** — dates and doctors you have saved.
  - If you have **unanswered questions** saved for that doctor, you may see a **badge** reminding you how many are still open.
  - You may see **Enable reminders** — this asks your browser for permission to show a **notification** (for example after an appointment time) so you remember to log how the visit went. Notifications work best if you **add the app to your phone’s home screen** (on some phones this is required for alerts).
- **Pending visits** — visits you started but have not finished yet.
- **Log today** — shortcuts to **Pain**, **Episodes**, **Questions**, and **Visit log**.
- **Clinical handoff summary** — builds a story-style summary from your saved data (more below).
- **Links** to the rest of your records (medications, doctors, tests, and so on).

---

## Quick log (Pain and Episodes)

**Quick log** is for fast entries without hunting through menus.

### Pain

- You can note **date, time, intensity, where it hurts**, and optional details (triggers, what helped, notes).
- Saved pain appears in **Records** (Pain tab), newest first.
- It also feeds **Charts & trends** (see below).

### Episodes (symptom episodes)

- Episodes are for logging things like **flare-ups** or **clusters of symptoms** you care about.
- You can list **features** (individual symptoms or bullet points).  
- In **Records**, under each episode, each **feature** can show a small **✕** so you can remove one feature from that entry if you tapped the wrong one—without deleting the whole episode.

---

## Records (Pain & episodes archive)

**Records** is a searchable list of what you already saved:

- **Pain** tab — your pain log.
- **Episodes** tab — your episode log.

Use **Search** to filter by text (for example a body area or a word in your notes).

---

## Charts & trends (Analytics)

**Charts & trends** turns your saved pain and episodes into **pictures**, not doctor’s orders:

- **Pain over time** — simple bars by average intensity per day so you can see ups and downs even if some entries do not have every optional field filled in.
- **Top pain areas** — uses the **locations** you typed (left/right and areas are counted separately if you wrote them that way).
- **Common episode features** — how often each feature showed up in your episode log.
- **Time of day** grids — only fill in if you logged **times** with your entries; that is normal if you sometimes skip the clock.

Charts are for **your awareness** and for **talking with your clinician**—not for self-diagnosis.

---

## Visits

You can **log a visit** in a guided **wizard** (step by step) or using fuller forms on the visit pages, depending on how your screen is set up.

**Useful tips:**

- **Reason for visit** — choose a **quick pill** (for example follow-up or new symptoms), type your own wording, or **pin** a custom reason so it stays in your short list (pins are saved on **this device/browser**).
- You can save a visit as **complete** or **pending** and finish details later.

---

## Doctors

**My Doctors** is your address book of providers.

- Tap a doctor to open a **profile** with visits, questions, diagnoses, medications, and tests linked to that name.
- **Phone** — tap to start a **call** on your phone (uses your phone’s dialer).
- **Address** — tap to open **Google Maps** (or your map app) with directions search.
- **Archive** — instead of deleting someone forever, you can **archive** them and optionally note why (retired, switched clinics, and so on). Archived doctors move to an **Archived** section; you can **restore** them later.

**Diagnoses** you log on a doctor’s profile are meant to stay in sync with your main **Diagnoses directory** when the app can match the names—so you are not maintaining two totally separate lists by hand.

---

## Questions for your doctor

The **Questions** area is where you write things you want to remember to ask.

- The **Questions** screen lists everything you saved; use **All / Open / Answered** to filter. To **add** a new question, tap the **green +** in the corner of the **All Questions** banner (the add form stays tucked away until you open it).
- You can also add questions from **Quick log** on the Dashboard (same flow, optimized for a fast entry).
- You can track **priority**, **whether it was answered**, and sometimes tie a question to an **appointment date**. You can tap an **open** question and type an answer right on the list when your app supports it.
- On the **Dashboard**, upcoming appointments can show if you still have **open questions** for that doctor—so you remember to bring them up or to log answers after the visit.

---

## Medications

Track **current medications**, doses, how often you take them, and notes (for example who prescribed them). You can log **dose changes** over time so your summary can mention what changed and when.

**PRN** means “as needed”—your app may let you mark that separately from scheduled doses.

---

## Tests & orders

List **tests** (labs, imaging, and similar) with **status** (pending, completed, and so on) and optional documents if your setup supports uploads.

---

## Diagnoses directory

A **single place** to see conditions you are tracking, their **status** (for example suspected vs confirmed), **dates**, and **which doctor** they are linked to—grouped so you can expand or collapse by provider.

**Quick add** chips can speed up common diagnosis names; you can still type your own.

---

## Clinical handoff summary

This feature **reads the information you already saved** and writes a **first-person story**—as if you are speaking to a clinician—covering recent pain/episodes, medications, changes, visits, and your questions.

- You can often choose **short** vs **more thorough** wording inside the app.
- You may optionally use **AI** to polish the text **if** whoever hosts the app turned that on (it uses a secure server; you do not paste API keys yourself).
- You can **download a PDF** of the summary on your device.

The summary is a **draft meant to help you communicate**. Always **double-check** facts before sharing; **do not** treat it as a prescription or a diagnosis.

---

## Privacy in plain words

- Your entries are tied to **your login**.
- **Do not** post screenshots of the app in public places if they show private information.
- If you use **optional AI**, a compact version of your summary context may be sent to an AI provider **through the app’s backend** when that feature is enabled—only the person hosting the app can confirm exactly what is sent.

---

## If something looks wrong

- **Blank charts** — you may need more entries, or **fill in time** for time-of-day charts and **location** for area rankings.
- **Errors after an update** — whoever maintains your database may need to run the latest **SQL migrations** (technical step—see **DEVELOPERS.md**).
- **Notifications** — phones differ; you may need to allow notifications in **system settings** and, on iPhone, sometimes add the site to your **Home Screen** first.

---

## Where to get help

- **Day-to-day use** — refer back to this guide.
- **Hosting, passwords reset by admin, or database errors** — talk to whoever **set up** your copy of Medical Bible, or read **DEVELOPERS.md** if you are that person.

---

## Quick map of the app (optional)

| You want to…              | Look for…                          |
|---------------------------|------------------------------------|
| Log pain or an episode fast | Dashboard → Quick log, or **Log** |
| See old pain/episodes     | **Records**                        |
| See graphs                | **Charts & trends**                |
| Log or finish a visit     | **Visits**                         |
| Manage doctors            | **My Doctors**                     |
| List questions            | **Questions**                      |
| Meds list                 | **Medications**                    |
| Labs / imaging            | **Tests** (wording may vary)       |
| Conditions list           | **Diagnoses**                      |
| Big summary for a visit   | **Clinical handoff** on Dashboard |

Names on the buttons might match these ideas even if the exact label is slightly different in your version.

---

## If you maintain or back up the project files

This guide is for **using** the app. If you are the person who keeps a copy of the **source code** (for example to run your own server or archive the project), see **[DEVELOPERS.md](./DEVELOPERS.md)** for setup, database migrations, and scripts.

To produce **one text file** that bundles application source, **Supabase SQL migrations**, Edge Function sources, and key configs (no `node_modules`), from the project folder run:

`npm run export:txt`

That writes a timestamped file under the **`exports/`** folder, for example `exports/project-code-and-sql-YYYY-MM-DD-HH-MM-SS.txt`.

---

*This project is a personal health organizer. It does not provide medical advice.*
