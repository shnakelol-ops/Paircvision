# Privacy Policy

**Version 1.0 — Beta**
**Last updated: 16 June 2026**

---

## 1. Who We Are

PáircVision is a coaching analytics application for Gaelic games, developed by **[COMPANY LEGAL NAME]**, a company registered in Ireland (Company No. **[XXXXXXXX]**) with a registered address at **[REGISTERED ADDRESS]**.

In this policy, "PáircVision", "we", "us" and "our" refer to **[COMPANY LEGAL NAME]**.

For privacy matters, you can contact us at: **privacy@paircvision.com**

---

## 2. What This Policy Covers

This policy explains what information is collected when you use PáircVision, how that information is handled, where it is stored, and what rights you have under the General Data Protection Regulation (GDPR) and applicable Irish law.

PáircVision is built on an architecture that is deliberately local-first: the coaching data you create stays on your own device. It is not uploaded to our servers. This shapes nearly every section of this policy.

---

## 3. The Short Version

- PáircVision does not create user accounts and does not ask for your name, email address, or any personal details.
- The coaching data you create — match statistics, player names, voice notes, training records, tactical boards — is stored in your browser, on your device, and is never sent to us or to any third party.
- The only personal data processed as part of providing the service is the standard technical information associated with delivering the application through our hosting provider, Vercel.
- We do not use analytics, advertising, tracking pixels, or any third-party services that profile your behaviour.
- We do not set cookies.

---

## 4. Information We Do Not Collect

To be explicit: PáircVision does not collect, receive, or store:

- Your name or email address
- Login credentials or account information
- Your physical location or GPS data
- Payment card or banking information
- Advertising identifiers or device fingerprints
- Usage analytics, session recordings, or behavioural data
- The contents of your voice notes
- Your coaching data, match records, tactical boards, or training information
- Player names or any information you enter about players

None of this information is transmitted from your device to PáircVision or to any third party.

---

## 5. Information Collected When You Visit the App

### 5.1 Server Logs (Vercel)

When your browser loads PáircVision, your device makes a standard HTTP request to our hosting provider, Vercel Inc. (USA). As part of normal web server operation, Vercel's servers automatically record:

- Your IP address
- The date and time of the request
- The browser and operating system type (User-Agent string)
- The URL path requested
- The HTTP status code returned

This information is recorded in Vercel's server logs. PáircVision does not control the specific retention period for these logs, which is governed by [Vercel's Privacy Policy](https://vercel.com/legal/privacy-policy). We access these logs only to diagnose technical problems with the service.

We process this server log data on the basis of our **legitimate interests** under Article 6(1)(f) GDPR — specifically, our interest in operating a stable and secure web service.

### 5.2 What Does Not Happen

Once the app has loaded in your browser, all further activity — creating matches, entering player names, recording voice notes, building tactical boards — takes place entirely within your browser. No further data is sent to our servers or to any external service.

---

## 6. Coaching Data You Create

### 6.1 Where It Goes

All coaching data you create in PáircVision is stored locally, in your browser's built-in storage on your device. This includes:

- Saved matches, scores, and event logs
- Team and player names, jersey numbers, and positions
- Squad templates
- Text notes and voice note recordings
- Training session records, attendance, and per-player notes
- Tactical board diagrams and scenarios
- Player performance records

Unless you choose to export or share it, this data remains stored locally on your device. PáircVision never uploads your coaching data to our servers or to any third party.

### 6.2 How It Is Stored

Your browser provides two types of local storage that PáircVision uses:

**localStorage** — a key-value store in your browser where match records, notes metadata, squad data, training sessions, tactical boards, and app settings are saved as text. This storage persists until you clear your browser data or manually delete the information within the app.

**IndexedDB** — a database built into your browser where audio blobs from voice note recordings are stored. Each voice note is saved as a WebM audio file in a local database on your device. This storage also persists until you delete the recording or clear your browser data.

Neither of these is a cookie. They are standard browser storage mechanisms used to make the app work offline and across sessions.

---

> **Important**
>
> PáircVision stores your coaching information locally on your device. Clearing your browser data, uninstalling the application, resetting your browser, or moving to a different device may permanently remove your saved information. Because this information is not stored on PáircVision's servers, we cannot recover it for you.

---

### 6.3 Player Names and Personal Information You Enter

PáircVision is designed so that coaching data remains on your own device and is not transmitted to our servers. In most cases, coaches or clubs remain responsible for the personal information they choose to record and manage within the app.

If you enter player names, jersey numbers, positions, or attendance records, that information is stored locally on your device under your control. Section 11 (Coaches and Player Data) provides further guidance on your responsibilities in this regard.

---

## 7. Voice Notes

If you choose to record a voice note during a match, PáircVision will request microphone access from your browser. You will see a permission prompt from your browser — this is a standard browser security measure, and the app will not record anything until you grant permission.

When you record a voice note:

- The audio is captured using your device's microphone.
- The recording is stored as a WebM audio file in your browser's IndexedDB storage, on your device only.
- The recording is never uploaded to PáircVision or any server.
- You can delete individual voice notes at any time within the app.

Microphone access is optional. If you decline the permission, all other features of PáircVision continue to work normally.

---

## 8. Coaching Clip Recording

PáircVision includes a feature to record the tactical board as a coaching video clip. When you use this feature:

- The app captures your device screen's canvas — specifically, the tactical board you have drawn — as a video stream.
- Your camera is never used. Only the on-screen board content is recorded.
- You may optionally add microphone audio to accompany the recording; this requires microphone permission and works the same way as voice notes.
- The resulting video file (in MP4 or WebM format) is held temporarily in your device's memory and is either downloaded directly to your device or shared via your operating system's share function.
- The video is not stored by PáircVision and is not uploaded anywhere.

Once you download or share the clip, it exists only on your device or with whoever you choose to send it to.

---

## 9. Exports, Downloads, and Sharing

PáircVision allows you to export your coaching data in several formats:

- **PDF reports** — Match intelligence reports are generated entirely within your browser. The resulting file is downloaded to your device. Nothing is sent to a server during this process.
- **PNG images** — Tactical board screenshots are generated within your browser and downloaded to your device or shared via your operating system's share sheet.
- **Video clips** — As described in Section 8.
- **Web Share** — Where available, the app uses your operating system's native share function. You choose where to send the file. PáircVision has no visibility into where you share it or to whom.

All export and sharing activity is initiated explicitly by you. Nothing is shared automatically in the background.

---

## 10. Browser Permissions

The table below summarises every browser permission PáircVision may request and why.

| Permission | When Requested | Purpose | Required? |
|---|---|---|---|
| **Microphone** | When you first tap the voice note record button | To capture audio for voice note memos | No — the app works fully without it |
| **Storage** (localStorage / IndexedDB) | Automatically on first use | To save your coaching data locally between sessions | Yes — necessary for the app to function |
| **Service Worker / Cache** | Automatically on first use | To cache app files for offline use | No — automatic PWA behaviour; disabling does not prevent use |

PáircVision does not request camera access, location data, notifications, or clipboard access.

---

## 11. Coaches and Player Data

PáircVision is designed so that coaching data remains on your own device and is not transmitted to our servers. In most cases, coaches or clubs remain responsible for the personal information they choose to record and manage within the app.

This means:

- You should have a legitimate reason to collect and use player information (for example, your role as coach and the legitimate purpose of squad management and performance development).
- You should not enter more detail about players than is necessary for coaching purposes.
- If players or their parents ask about the information you hold in the app, you should be able to respond to them.
- If a player (or the parent or guardian of a minor player) asks you to delete their information, you should delete it from the app.

PáircVision provides the tools to delete squad data, training records, and notes within the app.

---

## 12. Children and Young Players

PáircVision is a coaching tool intended for use by adults in a coaching role. Many users will use it to manage squads that include players under 18.

Where you are using PáircVision in connection with minor players:

- You, as the coach or club, are responsible for ensuring that your collection and use of that information is appropriate and consistent with your obligations to young people and their parents.
- Special care should be taken with any notes that touch on a player's health, injury, or personal circumstances.
- PáircVision does not impose age restrictions on the app itself, but coaches using the app with youth squads carry responsibility for how they use the information they enter.

If you have concerns about how to handle information relating to minors in your coaching role, the **Data Protection Commission** (www.dataprotection.ie) and Sport Ireland's safeguarding resources provide relevant guidance.

---

## 13. Third-Party Services

The only third-party service involved in the operation of PáircVision is **Vercel Inc.**, which hosts and delivers the application files to your browser.

| Service | Role | Data Received | Their Privacy Policy |
|---|---|---|---|
| **Vercel Inc.** (USA) | Hosting provider | IP address, browser type, timestamp, URL, HTTP status — as part of standard web server logs | vercel.com/legal/privacy-policy |

No other third-party services, analytics tools, advertising networks, or external APIs are used.

---

## 14. Open-Source Software

PáircVision makes use of a number of open-source software libraries to provide functionality within the application. These libraries operate entirely within your browser and do not receive, collect, or transmit your coaching data.

---

## 15. Cookies

PáircVision does not set cookies.

The app uses browser localStorage and IndexedDB (described in Section 6.2) to store your coaching data locally. These are not cookies and are not used for tracking or advertising purposes. They are used solely to make the app function.

Under Irish data protection law (SI 336/2011, implementing the EU ePrivacy Directive), storing information in a user's browser is permitted without consent where it is strictly necessary for the provision of the service the user has requested. The storage PáircVision uses falls within this category.

---

## 16. Your Rights Under GDPR

Under GDPR, you have the following rights in relation to personal data held about you:

- **Right of access** — You have the right to know what personal data is held about you.
- **Right to erasure** — You have the right to request deletion of your personal data.
- **Right to rectification** — You have the right to have inaccurate data corrected.
- **Right to restriction** — You have the right to limit how your data is used in certain circumstances.
- **Right to data portability** — You have the right to receive your personal data in a portable format.
- **Right to object** — You have the right to object to processing based on legitimate interests.

### How These Rights Apply in Practice

The only personal data that PáircVision processes as part of delivering the service is the server log data described in Section 5.1. To exercise any of the above rights in relation to that data, please contact us at **privacy@paircvision.com**.

For the coaching data you create within the app — player names, match records, voice notes, training information — that data exists only on your device. You can exercise control over this data directly:

- Delete individual voice notes, matches, boards, and training sessions from within the app.
- Clear all app data by clearing your browser's local storage and site data in your browser settings.
- Export coaching data by using the PDF and PNG export features within the app.

### Complaints

If you are unhappy with how we have handled your personal data, you have the right to make a complaint to the **Data Protection Commission (DPC)**, the Irish supervisory authority for GDPR:

- Website: www.dataprotection.ie
- Phone: +353 (0)761 104 800
- Post: Data Protection Commission, 21 Fitzwilliam Square South, Dublin 2, D02 RD28

---

## 17. Data Retention

**Server log data (Vercel):** Retained according to Vercel's standard log retention practices. We access these logs only to investigate technical issues.

**Coaching data on your device:** There is no automatic expiry. Your data persists in your browser until you delete it within the app or clear your browser's stored data. We recommend periodically reviewing and deleting match records and training sessions you no longer need.

---

## 18. Changes to This Policy

If we make material changes to this policy, we will update the "Last updated" date at the top of this page and, where appropriate, display a notice within the app.

We will not reduce your privacy rights under an existing version of this policy without giving you clear notice and an opportunity to review the changes.

---

## 19. Contact

For any question about this policy or about how PáircVision handles data:

**Email:** privacy@paircvision.com
**Post:** [COMPANY LEGAL NAME], [REGISTERED ADDRESS]

---

*PáircVision is developed and operated by [COMPANY LEGAL NAME], registered in Ireland.*

---

## Before Publication — Required Actions

The following placeholders must be replaced before this document is published:

| Placeholder | Required Information |
|---|---|
| `[COMPANY LEGAL NAME]` | Legal company name as registered with the CRO |
| `[XXXXXXXX]` | CRO company registration number |
| `[REGISTERED ADDRESS]` | Company registered office address |

Replace all instances throughout the document. Once complete, remove this section before publishing.
