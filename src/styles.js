/**
 * The style object, and the two constants it is built from.
 *
 * It lives here rather than in App.jsx for one reason: `S` is read by 618
 * call sites across every screen, so while it sat at the bottom of App.jsx no
 * screen could be moved out of that file without taking it along. This is the
 * step that unblocks the split, not the split itself.
 *
 * It is pure data. Every value is a literal or a CSS `var()`, nothing here
 * calls into the app, and nothing here holds state -- which is what makes
 * moving it safe to check with a build rather than with a screenshot.
 *
 * The audits that measure this project count type sizes, radii and surfaces
 * IN THIS OBJECT, so an entry nothing renders makes the census read worse than
 * the app is. Delete dead entries; do not leave them for tidiness later.
 */

/**
 * The photo column.
 *
 * A product photo is CONTENT, not an interface glyph, so it does not sit in
 * the 20px icon slot that puts text on 72. It gets a real column, and there is
 * exactly one: 24 of gutter + 16 of card padding + 48 + 12, so every row that
 * leads with a picture starts its text on **100**.
 *
 * It is one number because it was three. The inventory row spent 48, every
 * sale row spent 40, and the low-stock strip spends 28, which put text on 100,
 * 92 and 78 on screens a person flips between with a tab strip. 92 against 100
 * is the near-miss class this file has a whole pass about: far too small to
 * name and far too large not to feel.
 */
const PHOTO = { size: 48, radius: 12, gap: 12 };

const SECTION_TYPE = { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: -0.1 };

const S = {
  shell: { minHeight: "100dvh", background: "var(--bg-primary)", display: "flex", justifyContent: "center", fontFamily: "var(--font-sans)", padding: 0, margin: 0 },
  phone: { width: "100%", maxWidth: 600, height: "100dvh", background: "var(--bg-primary)", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative", shadow: "none", borderRadius: 0 },
  screenWrap: { flex: 1, overflow: "hidden", position: "relative" },
  screen: { position: "absolute", inset: 0, overflowY: "auto", paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(80px + env(safe-area-inset-bottom))", scrollbarWidth: "none" },

  // Home's rhythm, and it is the same fix Analytics finding 1 got.
  //
  // It measured 8 / 16 / 14: three breaks doing one job, none of them chosen,
  // each one whatever margin the PRECEDING element happened to carry -- the
  // header's 8, the summary card's 16, the banner's own. 16 against 14 is the
  // two-pixel near-miss this project has a whole pass about.
  //
  // Now every break belongs to the block that STARTS, on the app's one ratio:
  // 12 within a group, 28 between. The header and the summary card are one idea
  // (who you are, how your month is going), so that gap is 12. The warning and
  // the list are each a new section, so both are 28.
  homeHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "16px 24px 0" },
  greeting: { fontSize: 14, color: "var(--text-secondary)", margin: 0, fontWeight: 400, letterSpacing: 0 },
  userName: { fontSize: 26, color: "var(--text-primary)", margin: "2px 0 0", fontWeight: 600, fontFamily: "var(--font-sans)", letterSpacing: -0.7, lineHeight: 1.15 },
  avatar: { width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg,#A5603A,#7A5514)", color: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, flexShrink: 0 },
  settingsInput: { width: "100%", border: "1px solid var(--border-color)", borderRadius: 12, padding: "12px", fontSize: 16, color: "var(--text-primary)", background: "var(--card-bg)", marginTop: 4 },

  summaryCard: { margin: "12px 24px 0", background: "linear-gradient(135deg,var(--focus-ground),#5C3D2E)", borderRadius: 22, padding: "20px 16px", position: "relative", overflow: "hidden" },
  summaryLabel: { fontSize: 11, color: "rgba(255,255,255,0.85)", margin: "0 0 6px", letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600 },
  summaryAmount: { fontSize: 36, color: "var(--on-color)", margin: "0 0 18px", fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: -1.6, lineHeight: 1.05 },
  amountUnit: { fontSize: "0.5em", fontWeight: 500, opacity: 0.5, letterSpacing: 0.8, marginRight: "0.2em" },
  summaryRow: { display: "flex", alignItems: "center", gap: 16 },
  summaryNote: { fontSize: 12, color: "rgba(255,255,255,0.78)", margin: 0, lineHeight: 1.5, maxWidth: 380 },
  summaryDivider: { width: 1, height: 28, background: "rgba(255,255,255,0.2)" },
  summarySubLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 },
  summarySubVal: { fontSize: 16, color: "var(--on-color)", margin: 0, fontWeight: 600 },

  alertBanner: { margin: "28px 24px 0", background: "var(--warning-bg)", borderRadius: 16, padding: "13px 15px", display: "grid", gridTemplateColumns: "20px minmax(0,1fr)", columnGap: 12, alignItems: "start", border: "1px solid var(--warning-border)" },
  alertIcon: { fontSize: 20, flexShrink: 0, marginTop: 1 },
  alertTitle: { fontSize: 14, fontWeight: 600, color: "var(--warning)", margin: "0 0 3px" },
  alertSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400, lineHeight: 1.45 },

  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px 12px", marginTop: 28 },
  /* The TYPE only, and no margin. Used inside `sectionRow`, which is a centred
     flex row, and as the base for the onboarding headings. A top margin on
     either would misalign the label against the button beside it. */
  sectionLabel: { ...SECTION_TYPE },
  /* A label that STARTS a section in a scrolling column, and owns the break
     above it.
     That break used to be residue rather than a decision: `tabInner` supplies a
     12px gap and each section was separated by whatever `marginBottom` the
     PRECEDING element happened to carry. The summary card had 16, a chart card
     had 8, and a list row had none, so the three gaps on Analytics measured 28,
     20 and 12. The last one is the defect: 12 is also the gap between two rows
     INSIDE the list above it, so a new heading sat no further from the previous
     section than two items in one list, and nine rows read as a single run.
     Owned here, every section break is 12 + 16 = 28 against 12 within a group:
     one ratio, one place to change it, and nothing to remember at a call site. */
  sectionHead: { ...SECTION_TYPE, marginTop: 16 },
  // The lead owns the same 16 as a section head, so the break above it is the
  // app's 28 and it sits in the page's rhythm rather than beside it. No
  // background, no border, no radius: on a screen of eleven cards the one thing
  // that is not a card is the thing the eye finds first.
  lead: { marginTop: 16 },

  // The business named beside its period control. Both are about the WHOLE
  // page, so they sit above everything rather than beside the first card.
  analysisHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0 },
  analysisBiz: { ...SECTION_TYPE, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  chartNote: { fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 },

  // Not `infoCard`: that carries a 4px accent border, which is a status device,
  // and this is a figure rather than a status. Same 16 padding as every card.
  shelfCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", boxShadow: "0 0 0 1px var(--border-color)", display: "flex", flexDirection: "column", gap: 4 },
  shelfValue: { fontSize: 20, fontWeight: 600, letterSpacing: -0.4, color: "var(--text-primary)", margin: 0 },
  leadEyebrow: { fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", margin: "0 0 6px" },
  leadBody: { fontSize: 16, fontWeight: 500, lineHeight: 1.45, letterSpacing: -0.1, color: "var(--text-primary)", margin: 0, maxWidth: 420 },
  textBtn: { fontSize: 14, color: "var(--accent-text)", fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "12px 6px", margin: "-12px -6px", minHeight: 44 },

  /* No side padding, because the row is full-bleed: the wash has to reach both
     screen edges or it is a card again. The 24px gutter moved onto the row's
     own padding, so text still starts on 24 and the figures still end on 366. */
  bizList: { display: "flex", flexDirection: "column" },
  bizRow: { display: "grid", gridTemplateColumns: "36px minmax(0,1fr) auto", alignItems: "center", gap: "0 12px", padding: "14px 24px", width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--border-color)", textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" },
  /* The shop's own sign, and the only thing on this screen that is allowed to
     carry the owner's colour. It replaced a 4px stripe plus a bare glyph, which
     between them were 1.8% of the row: too small to recognise before reading,
     and sitting at the edge rather than where the eye enters. 36px is not a
     round number chosen by feel, it is what keeps the text on 72: the 24 gutter
     plus 36 plus the row's own 12 gap. */
  /* 36 rather than the old 20, and the number is not free: text after an icon
     sits on 72, which is the 24 gutter plus this slot plus the row's 12px gap.
     It also finally gives the glyph a box it fits in. The sweep has reported an
     emoji painting 25px inside a declared 20px slot since the motion session. */
  /* Full row height and flush to the screen edge, inside the 24px gutter where
     no type ever goes. That is the whole reason it can be full strength: no
     contrast ratio applies to a band nothing is written on. */
  bizKerb: { position: "absolute", left: 0, top: 0, bottom: 0, width: 10 },
  /* 24, up from 19. An emoji renders about 1.37x its font-size, so this paints
     33x31 and the 36px slot holds it with 1.5px clear, measured on all four
     rows at offset 0,0 from the slot's centre. Do not raise it further without
     re-measuring: 26px is where it stops fitting. */
  // The picture as a control. No fill, no border and no shadow of its own: the
  // image is the affordance and a frame around it would be a second one.
  photoTarget: { background: "none", border: "none", padding: 0, cursor: "pointer", borderRadius: 16, lineHeight: 0, display: "block" },
  photoBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--control-bg)", color: "var(--text-primary)", border: "1px solid var(--control-border)", borderRadius: 12, padding: "8px 12px", fontSize: 14, fontWeight: 600, fontFamily: "var(--font-sans)", cursor: "pointer", minHeight: 40 },
  bizRowSlot: { width: 36, textAlign: "center", fontSize: 24, lineHeight: 1 },
  bizRowMain: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  bizRowName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  bizRowMeta: { fontSize: 12, fontWeight: 400, color: "var(--text-secondary)" },
  bizRowRight: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, textAlign: "right" },
  bizRowAmount: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: -0.2 },
  bizRowNote: { fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" },
  bizName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 3px" },
  bizCat: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  badge: { fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 },

  /* Its own gutter now. It used to inherit one from bizList, which the
     full-bleed rows took away. */
  emptyState: { padding: "40px 16px", textAlign: "center" },
  emptyIcon: { fontSize: 40, margin: "0 0 12px" },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px" },
  emptySub: { fontSize: 14, color: "var(--text-secondary)", margin: 0, fontWeight: 400, lineHeight: 1.45 },

  // BIZ SCREEN
  bizHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 10px", flexShrink: 0 },
  backBtn: { fontSize: 22, background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", margin: -11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0 },
  iconBtn: { fontSize: 18, background: "none", border: "none", cursor: "pointer", margin: -12, display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0 },
  bizHeaderCenter: { display: "flex", alignItems: "center", gap: 8 },
  bizHeaderName: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", letterSpacing: -0.1 },

  bizHero: { margin: "0 24px 16px", borderRadius: 22, padding: "20px 16px", position: "relative", overflow: "hidden" },
  heroLabel: { fontSize: 11, color: "rgba(255,255,255,0.88)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 },
  heroAmount: { fontSize: 26, color: "var(--on-color)", margin: "0 0 12px", fontFamily: "var(--font-sans)", fontWeight: 500, letterSpacing: -0.8, lineHeight: 1.05 },
  heroMeta: { display: "flex", gap: 16, fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 400, marginBottom: 14 },
  heroMetaVal: { color: "var(--on-color)", fontWeight: 600 },
  progBg: { height: 4, background: "rgba(255,255,255,0.22)", borderRadius: 99, overflow: "hidden" },
  progFill: { height: "100%", background: "rgba(255,255,255,0.85)", borderRadius: 99 },

  tabs: { display: "flex", padding: "0 24px", gap: 8, marginBottom: 14, flexShrink: 0 },
  tab: { flex: 1, padding: "9px 0", borderRadius: 12, border: "none", background: "var(--control-bg)", color: "var(--text-secondary)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "var(--font-sans)", transition: "background-color var(--motion-tap) var(--ease-out), color var(--motion-tap) var(--ease-out)" },
  tabActive: { background: "var(--text-primary)", color: "var(--bg-primary)" },
  tabContent: { flex: 1 },
  /* The photo is CONTENT, so it gets a real column rather than the 20px icon
     slot the alignment system reserves for interface glyphs. Text in these rows
     therefore starts on 108 (24 gutter + 16 card padding + 56 + 12) rather than
     the usual 40. That is a deliberate second column, not a near-miss: it is
     36px clear of the 72 line, and every row has the slot whether it holds a
     photo or not, so nothing in the list is ragged. */
  /* 48, not 56. The row already carried a name, two meta lines, a restock
     button and a profit column, and at 320 a 56px photo left the name 54px to
     live in. Measured, not guessed. */
  customTag: { fontSize: 11, fontWeight: 600, color: "var(--warning)", background: "var(--control-bg)", padding: "2px 6px", borderRadius: 99, letterSpacing: 0.4, textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 },
  invPhotoBtn: { background: "none", border: "none", padding: 0, marginRight: PHOTO.gap, cursor: "pointer", borderRadius: 12, flexShrink: 0, lineHeight: 0 },
  tabInner: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  infoCard: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px 14px 12px", borderLeft: "4px solid var(--warning)", boxShadow: "0 0 0 1px var(--border-color)" },
  infoLabel: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  infoVal: { fontSize: 16, color: "var(--text-primary)", margin: "0 0 4px", fontWeight: 600 },
  infoSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 400, lineHeight: 1.45 },

  statsGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 },
  statCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px", boxShadow: "0 0 0 1px var(--border-color)" },
  statLbl: { fontSize: 11, color: "var(--text-secondary)", margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 },
  statVal: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: -0.3 },

  dashedBtn: { background: "none", border: "2px dashed var(--control-border)", borderRadius: 12, padding: "13px", textAlign: "center", color: "var(--accent-text)", fontWeight: 600, fontSize: 14, cursor: "pointer", width: "100%", fontFamily: "var(--font-sans)" },

  // Wraps, and the wrap engages only when the row genuinely does not fit. At
  // 320 the widest of these wants 48 of photo, 12 of gap, a 96px name floor and
  // a money column whose MIN-content is 99, because "FCFA 45,500" is one
  // unbreakable token: 255 in 240. Four things and not one of them can give, so
  // the figures take their own line rather than the row running past the card
  // edge. At 360 and up nothing moves.
  invRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", flexWrap: "wrap", rowGap: 4, justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 0 0 1px var(--border-color)" },
  // The sold-out group's header. Same surface, radius, padding and hairline as
  // the rows it holds, because a shut section here IS a row on this screen's
  // card. It does not wrap: an icon, a two-line label and a chevron, with the
  // label the only thing allowed to give.
  invGroupRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 0 0 1px var(--border-color)", border: "none", width: "100%", cursor: "pointer", font: "inherit", textAlign: "left" },
  invNameRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 5 },
  invName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 },
  invSub: { fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0", fontWeight: 400 },
  invProfit: { fontSize: 14, fontWeight: 600, color: "var(--success)", margin: 0 },
  // The figure that leads an inventory row. Not green: it is a count, not a
  // gain, and the badge beside it is what carries any colour the row needs.
  invStock: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap" },
  lowBadge: { fontSize: 11, fontWeight: 600, background: "var(--danger-bg)", color: "var(--danger)", padding: "2px 7px", borderRadius: 99, whiteSpace: "nowrap", flexShrink: 0 },
  marginBadge: { fontSize: 11, color: "var(--success)", fontWeight: 600, background: "var(--success-bg)", padding: "2px 8px", borderRadius: 99 },
  deleteBtn: { fontSize: 14, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, width: 44, height: 44, margin: "-12px -14px -12px 0", display: "flex", alignItems: "center", justifyContent: "center" },

  saleRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "flex", flexWrap: "wrap", rowGap: 4, justifyContent: "space-between", alignItems: "center", boxShadow: "0 0 0 1px var(--border-color)" },
  saleName: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" },
  saleSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  saleRev: { fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 3px" },
  salePft: { fontSize: 12, color: "var(--success)", fontWeight: 500 },
  restockBtn: { background: "var(--control-bg)", color: "var(--warning)", border: "none", padding: "0 16px", minHeight: 44, borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8, display: "inline-flex", alignItems: "center" },

  // ANALYTICS
  analyticsRow: { background: "var(--card-bg)", borderRadius: 16, padding: "14px 16px", display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", columnGap: 12, rowGap: 10, alignItems: "center", boxShadow: "0 0 0 1px var(--border-color)" },
  /* No `marginBottom`. It was one of the three ad-hoc values faking a section
     break; `sectionHead` owns that now. */
  // 16 top and bottom, 8 left and right, and both halves of that are chosen.
  //
  // It was 16/8/8, which is the one spelling that is wrong: 16 above the plot
  // and 8 below it, so the chart sat high in its own surface for no reason
  // anyone picked. Vertically it is symmetric now, like every other card.
  //
  // Horizontally it stays at 8, and that is the design system's own "unless
  // content genuinely demands asymmetry". It was measured rather than assumed:
  // at 320 the extra 16px of plot is worth ONE more week label on the axis
  // (7 of 8 against 6), and at 360 and up it costs nothing either way. A card
  // of text spends 16 at the sides; a card holding a plot spends 8 and buys a
  // label with it.
  chartCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px 8px", boxShadow: "0 0 0 1px var(--border-color)" },
  noteCard: { background: "var(--control-bg)", borderRadius: 16, padding: "14px 16px" },
  rankNum: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textAlign: "center", fontVariantNumeric: "tabular-nums" },
  /* When the ring is on screen the rank IS the legend. Reusing the number that
     was already in the row beats adding a colour dot beside it: the row
     already carries a rank, an emoji and a name, and a fourth mark would be
     one more thing competing in a 20px column.

     `ringColor`, never the raw colour. White on the raw palette fails AA on
     NINE of the sixteen, worst 3.10:1 on the sage, which is exactly what
     `heroTint` was written to prevent and exactly what this nearly shipped.
     `ringColor` darkens in light mode and LIFTS in dark, because a darkened
     segment is invisible on a dark card. The segment uses the same function,
     so the key and the slice are the same colour in both themes. */
  rankKey: { width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  analyticsProfit: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap" },

  // SETTINGS
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 16px" },
  pageTitle: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0, fontFamily: "var(--font-sans)", letterSpacing: -0.4 },

  // 16, not 28: the container this sits in already supplies a 12px gap, and
  // 28 on top of that measured 40. Same trap the summary card fell into twice
  // today -- a component with its own outer margin nested in something that
  // already has one. The break you get is the SUM.
  settingsSection: { marginTop: 16 },
  settingsSectionTitle: { fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.6, margin: "0 0 12px" },
  settingsCard: { background: "var(--card-bg)", borderRadius: 16, overflow: "hidden", boxShadow: "0 0 0 1px var(--border-color)" },
  settingsRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" },
  /* Same geometry as settingsRow, with a button's defaults undone so the row
     looks identical to the ones beside it. */
  switchRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", width: "100%", background: "none", border: "none", font: "inherit", textAlign: "left" },
  /* Exactly settingsRow's geometry, with a button's defaults undone, so the
     header of a shut section is indistinguishable from any other row. */
  discloseRow: { display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer", width: "100%", background: "none", border: "none", font: "inherit", textAlign: "left" },
  toggleTrack: { width: 44, height: 24, borderRadius: 99, position: "relative", flexShrink: 0, display: "block", transition: "background-color var(--motion-move) var(--ease-out)" },
  toggleKnob: { width: 18, height: 18, borderRadius: "50%", background: "var(--card-bg)", position: "absolute", top: 3, left: 3, transition: "transform var(--motion-move) var(--ease-out)" },
  settingsRowLabel: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 2px" },
  settingsRowSub: { fontSize: 12, color: "var(--text-secondary)", margin: 0, fontWeight: 400 },
  settingsDivider: { height: 1, background: "var(--border-color)", margin: "0 16px" },
  /* The two shapes a select takes here: compact, sitting at the end of a
     settings row, and full width inside a form. Both hide the platform arrow
     and leave room for the one the app draws: 12 of inset, a 20px chevron, and
     6 of air before the text can reach it. */
  select: { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 500, color: "var(--text-primary)", background: "var(--control-bg)", border: "1px solid var(--control-border)", borderRadius: 12, padding: "10px 12px", minHeight: 44, cursor: "pointer", fontFamily: "var(--font-sans)" },
  /* `flex: 1` so the label takes the slack and the chevron is pushed to the
     field's edge. Without it the span sizes to its text and the arrow sits
     wherever the words happen to end: measured 93px short of the right edge on
     the sale sheet, which is exactly the "floating" the native arrow was
     replaced for. `minWidth: 0` is what lets it ellipsise instead of refusing
     to shrink, the same flex default that produced two other bugs this week. */
  selectValue: { flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  /* An option is a row on the sheet, on the same 16px inner padding and 12px
     radius as every other control. The chosen one is marked by the accent tint
     AND a tick, never by colour alone. */
  optionRow: { display: "flex", alignItems: "center", gap: 12, width: "100%", minHeight: 52, padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border-color)", background: "var(--card-bg)", color: "var(--text-primary)", fontSize: 16, fontWeight: 500, fontFamily: "var(--font-sans)", cursor: "pointer", textAlign: "left" },
  optionRowOn: { background: "var(--control-bg)", borderColor: "var(--accent-text)", fontWeight: 600 },

  feedbackCard: { background: "var(--card-bg)", borderRadius: 16, padding: "16px", boxShadow: "0 0 0 1px var(--border-color)" },
  feedbackTitle: { fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px", letterSpacing: -0.1 },
  feedbackSub: { fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px", fontWeight: 400, lineHeight: 1.45 },
  emojiRow: { display: "flex", gap: 4, marginBottom: 16 },
  emojiBtn: { flex: 1, minWidth: 0, fontSize: 28, background: "none", border: "none", cursor: "pointer", padding: "4px 0", borderRadius: 12 },
  feedbackInput: { width: "100%", minHeight: 80, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "10px 12px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--bg-primary)", resize: "none", boxSizing: "border-box", marginBottom: 12 },
  submitBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" },

  // MODALS
  modalOverlay: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 100 },
  modalSheet: { position: "relative", background: "var(--bg-primary)", borderRadius: "22px 22px 0 0", width: "100%", maxHeight: "90%", overflowY: "auto", paddingBottom: "calc(40px + env(safe-area-inset-bottom))" },
  /* The strip the drag starts from: the handle and the title, and nothing
     below them. `touchAction: none` is what stops the browser claiming the
     gesture as a scroll before the handler ever sees it, and it is scoped to
     this strip precisely so the form underneath still scrolls normally. */
  modalGrab: { touchAction: "none", cursor: "grab", userSelect: "none" },
  modalHandle: { width: 40, height: 4, background: "var(--control-border)", borderRadius: 99, margin: "14px auto 4px" },
  /* Hidden by default and revealed at 700px by `.bt-sheet-close`. Inline
     styles outrank a stylesheet, so the media query carries `!important`,
     which is the same reason every responsive block in this app does. */
  modalClose: { display: "none", position: "absolute", top: 12, right: 12, width: 40, height: 40, alignItems: "center", justifyContent: "center", background: "var(--control-bg)", color: "var(--text-secondary)", border: "none", borderRadius: "50%", cursor: "pointer" },
  modalTitle: { fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: "8px 24px 16px", fontFamily: "var(--font-sans)", letterSpacing: -0.4 },
  modalBody: { padding: "0 24px", display: "flex", flexDirection: "column", gap: 12 },

  fieldLabel: { fontSize: 14, fontWeight: 500, color: "var(--text-secondary)", margin: "4px 0 4px", letterSpacing: 0 },
  formError: { fontSize: 13, fontWeight: 500, color: "var(--danger)", background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px 14px", margin: 0, lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  /* The same block on the screens that are dark in BOTH themes, which cannot
     use the light-mode tint above. Passed to them through `styles`, which is
     how they already get everything else, so there is one definition rather
     than one per screen. */
  formErrorDark: { fontSize: 13, fontWeight: 500, color: "var(--danger-on-focus)", background: "var(--danger-on-focus-bg)", border: "1px solid var(--danger-on-focus-border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 12px", lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  formNoticeDark: { fontSize: 13, fontWeight: 500, color: "var(--success-on-focus)", background: "var(--success-on-focus-bg)", border: "1px solid var(--success-on-focus-border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 12px", lineHeight: 1.45, animation: "bt-rise var(--motion-move) var(--ease-out)" },
  input: { width: "100%", height: 48, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "0 14px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--card-bg)", boxSizing: "border-box", appearance: "auto" },
  /* S.input, minus the platform arrow it explicitly asked for, plus room for
     the drawn one. Everything else matches the text fields it sits between. */
  selectFull: { display: "flex", alignItems: "center", gap: 8, width: "100%", height: 48, borderRadius: 12, border: "1.5px solid var(--border-color)", padding: "0 14px", fontSize: 16, fontFamily: "var(--font-sans)", color: "var(--text-primary)", background: "var(--card-bg)", boxSizing: "border-box", cursor: "pointer", textAlign: "left" },

  colorDot: { width: 44, height: 44, borderRadius: "50%", border: "none", cursor: "pointer", outlineOffset: 3 },
  /* Sized to the thing it sits beside, so the row stays one row. The count
     reads as a quantity rather than as an icon, which is the point: it says
     how much more there is without anyone having to open it. */
  pickMore: { width: 44, height: 44, borderRadius: "50%", border: "1px dashed var(--control-border)", background: "transparent", color: "var(--accent-text)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-sans)", cursor: "pointer", flexShrink: 0 },
  emojiPick: { fontSize: 24, border: "none", cursor: "pointer", padding: "6px", borderRadius: 12, width: 44, height: 44 },

  calcPreview: { background: "var(--success-bg)", borderRadius: 12, padding: "12px 16px", border: "1.5px solid var(--success-border)" },
  calcLabel: { fontSize: 14, color: "var(--text-primary)", margin: "2px 0", fontWeight: 400 },

  primaryBtn: { width: "100%", background: "var(--text-primary)", color: "var(--bg-primary)", border: "none", borderRadius: 12, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)", marginTop: 4 },
  ghostBtn: { width: "100%", background: "transparent", color: "var(--text-secondary)", border: "1.5px solid var(--control-border)", borderRadius: 12, padding: "14px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" },

  deleteWarning: { background: "var(--danger-bg)", borderRadius: 16, padding: "20px", textAlign: "center" },
  deleteIcon: { fontSize: 36, margin: "0 0 10px" },
  deleteTitle: { fontSize: 16, fontWeight: 700, color: "var(--danger)", margin: "0 0 8px", letterSpacing: -0.1 },
  deleteSub: { fontSize: 14, color: "var(--danger)", margin: 0, fontWeight: 400, lineHeight: 1.5 },

  // BOTTOM NAV
  bottomNav: { position: "absolute", bottom: 0, left: 0, right: 0, minHeight: "calc(78px + env(safe-area-inset-bottom))", boxSizing: "border-box", background: "var(--card-bg)", borderTop: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px env(safe-area-inset-bottom)" },
  navItem: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", padding: 0 },
  navPill: { display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, width: 88, padding: "8px 0", borderRadius: 16, position: "relative", zIndex: 1 },
  // Sits ON the grid rather than above it: its right edge is the 24px gutter,
  // the same line every amount in the ledger ends on. It was at 20 -- the only
  // element on the screen off the gutter, and 4px off is exactly the kind of
  // near-miss that reads as a mistake.
  //
  // The fill is not a special colour: it is the same `--text-primary` on
  // `--bg-primary` as every primary button in the app, so the action looks
  // like an action rather than like a floating ornament. What was making it
  // shout was the shadow -- 24px at 28% on a screen whose cards had just been
  // reduced to rules -- and the size.
  /**
   * THE FLOATING LAYER, measured from the bottom bar up.
   *
   *   0    the bar itself, 78px plus the gesture inset
   *   90   the Sale button, 12px of clearance above it, 46px tall
   *   148  anything above the button: the toast, and the install card on a
   *        screen that has a button
   *
   * Everything here also sits on the 24px screen gutter, so a toast lines up
   * with the card it is reporting on rather than 8px outside it.
   */
  fab: { position: "absolute", right: 24, bottom: "calc(90px + env(safe-area-inset-bottom))", zIndex: 90, display: "inline-flex", alignItems: "center", gap: 8, padding: "0 18px 0 15px", height: 46, borderRadius: 99, border: "none", cursor: "pointer", background: "var(--text-primary)", color: "var(--bg-primary)", boxShadow: "var(--shadow-raised)" },
  fabLabel: { fontSize: 14, fontWeight: 600, letterSpacing: -0.1 },
  navLabel: { fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, letterSpacing: 0.2 },

  numKey: { width: 64, height: 64, borderRadius: "50%", border: "1.5px solid var(--border-color)", background: "var(--card-bg)", fontSize: 24, fontWeight: 700, color: "var(--text-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },

  // TIMELINE
  timeline: { display: "flex", flexDirection: "column", gap: 24, paddingLeft: 12, marginTop: 10 },
  updateItem: { display: "flex", gap: 20, position: "relative" },
  timelineLine: { position: "absolute", left: 6, top: 0, bottom: -24, width: 2, background: "var(--border-color)", zIndex: 0 },
  timelineDot: { width: 14, height: 14, borderRadius: "50%", border: "3px solid var(--bg-primary)", position: "relative", zIndex: 1, marginTop: 18, marginLeft: -0.5 },
};

// SECTION_TYPE stays module-local: its only three readers -- sectionLabel,
// sectionHead and analysisBiz -- all live in this file, which is the point
// of the shared const. Exporting it would invite a fourth spelling elsewhere.
export { PHOTO, S };
