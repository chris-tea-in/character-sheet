# Skill Observation Log

Observations captured during task-oriented work. Each entry identifies a
potential skill improvement or new skill opportunity.

**Status key:** OPEN = not yet actioned | ACTIONED = skill updated/created |
DECLINED = user decided not to pursue

---

### Observation 1: Task observer log misidentified as a general note-taking location

**Date:** 2026-05-23
**Session context:** Architecture planning session for D&D 5e character sheet PWA
**Skill:** task-observor
**Type:** open-source
**Phase/Area:** Session Start Protocol / purpose clarity

**Issue:** When the user asked to "note the plan for later," the agent saved it to the task observer log (`skill-observations/log.md`), treating it as a general session note location. The user then asked "what is the task observer for," revealing the agent had misunderstood the log's purpose. The task observer log is for skill improvement observations only — not project plans, decisions, or session notes.

**Suggested improvement:** Add an explicit statement near the top of the log structure section clarifying that the log is exclusively for skill improvement observations and is not a general note-taking or project planning location. Could also add an anti-pattern: "Do not write project plans, architectural decisions, or session summaries to this log."

**Principle:** A tool's purpose should be clear enough that the agent never misuses it as a catch-all. When a log file exists alongside a memory system, the boundary between them needs to be explicit — ambiguity causes the agent to default to whichever feels convenient in the moment.

### Observation 2: Agent modified confirmed plan content without instruction as a side effect of addressing a separate concern

**Date:** 2026-05-24
**Session context:** D&D character sheet PWA — skeptic-engineer review of remaining steps
**Skill:** task-observor
**Type:** open-source
**Phase/Area:** File editing discipline / memory management

**Issue:** While addressing a skeptic-engineer concern about Dialog/Popover print hiding, the agent rewrote an existing line in the implementation plan — changing the wording of the dialog/print statement — without being instructed to modify that line. The line was agent-authored, but it represented a confirmed plan decision. Changing it as a side effect of a separate task silently removed that confirmed context. The user caught the unauthorised change and required the agent to read back proposed text before any further edits to the file.

**Suggested improvement:** Treat all content in a confirmed plan or memory file as immutable unless the user explicitly asks for it to be changed — regardless of whether the agent or the user originally wrote it. When addressing concern X requires touching a line that is not part of the request, surface the proposed change explicitly before editing. Additions to a file carry lower risk than modifications to existing lines; modifications always warrant confirmation.

**Principle:** Confirmed plan content represents decisions that have been accepted. Modifying it as a side effect of unrelated work — even with good intentions — silently resets those decisions. The origin of the content (agent vs user) does not determine its protected status; its presence in the confirmed plan does.

### Observation 3: Terse negation after multi-part response caused ambiguous revert

**Date:** 2026-05-24
**Session context:** D&D character sheet PWA — reviewing declined skeptic-engineer concerns
**Skill:** skeptic-engineer
**Type:** internal
**Phase/Area:** Post-review action handling

**Issue:** The user responded to a numbered list of concerns with "4) then don't do that." The agent interpreted this as an instruction to revert a plan change and made the revert edit. The actual intent was ambiguous — it could have meant "don't answer the dialog question further," "don't add `print:hidden` to component templates," or "don't worry about this concern now." The revert was made without clarifying, adding an unnecessary edit cycle.

**Suggested improvement:** When a short negation like "then don't do that" follows a multi-part response, ask one clarifying question before acting — especially before making a revert edit. "Do you want me to revert the plan change, or just not pursue this further?"

**Principle:** Terse confirmations or negations after multi-part responses are high-ambiguity inputs. A single clarifying question costs less than an incorrect edit plus a correction cycle.
