# Builds docs/elmenue_Cost_and_Pricing_Report.pdf  (all numbers computed here from the stated assumptions)
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

FX = 50.0      # EGP per USD (ASSUMPTION - sources conflict, confirm on cbe.org.eg)
EUR = 1.10     # USD per EUR (ASSUMPTION)
def egp(usd): return usd * FX
def f0(x): return f"{x:,.0f}"
def f2(x): return f"{x:,.2f}"
def usd(x): return f"${x:,.0f}"

# ---------------- load model ----------------
HOURS, DAYS = 12, 30
STAFF_DEV, STAFF_S = 5, 2.2          # waiter/cashier/kitchen tablets polling
GUEST_PEAK_PHONES, ACTIVE_SHARE, GUEST_S = 45, 0.5, 2.5
PEAK_RPS = STAFF_DEV / STAFF_S + GUEST_PEAK_PHONES * ACTIVE_SHARE / GUEST_S
AVG_SHARE = 0.35
AVG_RPS = PEAK_RPS * AVG_SHARE
REQ_CAFE = AVG_RPS * HOURS * 3600 * DAYS          # requests per cafe per month, as built (polling)
POLL_KB_COMPRESSED = 5.0              # measured 26 KB staff / 12.6 KB guest raw, ~4-5x gzip
ROW_KB = 15.0                         # measured: venue data without history = 12.9 KB (+ session state)
OPT_CUT = 0.70                        # adaptive polling + "nothing changed" replies

def vercel(req_m, kb, cpu_ms=12, mem_ms=80):
    cdn = max(0, req_m - 10) * 2.60
    inv = req_m * 0.60
    cpu = req_m * 1e6 * cpu_ms / 1000 / 3600 * 0.184
    mem = req_m * 1e6 * mem_ms / 1000 / 3600 * 1.0 * 0.0152
    gb = req_m * kb                       # req(M) * KB = GB
    fdt = max(0, gb - 1000) * 0.15
    org = gb * 0.06
    base = 20
    credit = -20
    return dict(base=base, cdn=cdn, inv=inv, cpu=cpu, mem=mem, fdt=fdt, org=org, credit=credit, total=base + cdn + inv + cpu + mem + fdt + org + credit, gb=gb)

def supa(req_m, row_kb, qps):
    comp = 10 if qps < 8 else 15 if qps < 25 else 110 if qps < 150 else 210
    gb = req_m * row_kb
    eg = max(0, gb - 250) * 0.09
    return dict(base=25, comp=comp, credit=-10, egress=eg, total=25 + comp - 10 + eg, gb=gb, compn={10: 'Micro', 15: 'Small', 110: 'Large', 210: 'XL'}[comp])

def scenario(cafes, mode):
    if mode == 'A':   req = REQ_CAFE * cafes / 1e6; kb = POLL_KB_COMPRESSED
    elif mode == 'B': req = REQ_CAFE * cafes * (1 - OPT_CUT) / 1e6; kb = POLL_KB_COMPRESSED * 0.35
    qps = req * 1e6 / (DAYS * HOURS * 3600)
    v, s = vercel(req, kb, cpu_ms=12 if mode == 'A' else 6, mem_ms=80 if mode == 'A' else 50), supa(req, ROW_KB, qps)
    return dict(req=req, qps=qps, v=v, s=s, total=v['total'] + s['total'] + 1.0)

def scenarioC(cafes):
    servers = 1 if cafes <= 15 else 2
    hz = servers * 8.99 * EUR
    bk = servers * 1.20 * EUR
    comp = 15 if cafes > 15 else 10
    s = 25 + comp - 10
    return dict(servers=servers, hz=hz, bk=bk, s=s, dom=1.0, total=hz + bk + s + 1.0)

# ---------------- styles ----------------
ss = getSampleStyleSheet()
H1 = ParagraphStyle('H1', parent=ss['Heading1'], fontSize=19, spaceAfter=6, textColor=colors.HexColor('#1b2a41'))
H2 = ParagraphStyle('H2', parent=ss['Heading2'], fontSize=13.5, spaceBefore=12, spaceAfter=5, textColor=colors.HexColor('#1b2a41'))
B = ParagraphStyle('B', parent=ss['BodyText'], fontSize=9.4, leading=12.6)
S = ParagraphStyle('S', parent=B, fontSize=8, leading=10, textColor=colors.HexColor('#444444'))
C = ParagraphStyle('C', parent=B, fontSize=8, leading=9.8)
CB = ParagraphStyle('CB', parent=C, fontName='Helvetica-Bold')
NOTE = ParagraphStyle('N', parent=B, backColor=colors.HexColor('#fff6e0'), borderColor=colors.HexColor('#e0b050'), borderWidth=0.6, borderPadding=5, spaceBefore=4, spaceAfter=6)
def P(t, st=B): return Paragraph(t, st)
def T(rows, widths, head=True, align_right_from=None, zebra=True):
    data = [[Paragraph(str(c), CB if (head and i == 0) else C) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[w * mm for w in widths], repeatRows=1 if head else 0)
    st = [('GRID', (0, 0), (-1, -1), 0.25, colors.HexColor('#c8cfd8')), ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 2.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5)]
    if head: st.append(('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e6ebf2')))
    if zebra:
        for i in range(1, len(rows)):
            if i % 2 == 0: st.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f7f9fb')))
    t.setStyle(TableStyle(st)); return t

story = []
# ---------------- cover ----------------
story += [P('elmenue &mdash; Cost, Pricing and Revenue Report', H1),
          P('Prepared 29 October 2026 &middot; Written for: the owner, to study and approve every price before anything is bought.', S),
          Spacer(1, 6),
          P('<b>Nothing has been bought or subscribed.</b> I did not open any payment page or enter any card. Every figure below was read from the vendor\'s own page during this session (links in section 1) or is marked <b>ESTIMATE</b>. "Cost to you" is what leaves your bank account; "Client pays" is what the café pays someone, or what I recommend you charge the café.', NOTE),
          P('<b>How to read the numbers.</b> Prices are in US dollars as the vendors quote them, with EGP shown at an <b>assumed EGP %s per USD</b> (the sources I found disagreed on today\'s rate: one aggregator said about 31, another about 51; confirm on cbe.org.eg and rescale). All vendor prices exclude VAT unless stated; Egyptian VAT on your own service fees is a question for your accountant.' % f0(FX), B)]

# ---------------- section 1 sources ----------------
story += [P('1. What I fetched (sources, all read on 29 Oct 2026)', H2), T([
    ['Vendor / topic', 'Official page read', 'What it gave me'],
    ['Vercel plans', 'vercel.com/pricing', 'Pro $20 per seat/month incl. $20 usage credit; 1 TB transfer; 10M CDN requests; $0.60/M invocations; add-ons'],
    ['Vercel Frankfurt', 'vercel.com/docs/pricing/regional-pricing/fra1', 'fra1 rates: $2.60/M requests, $0.184/h CPU, $0.0152/GB-h memory, $0.15/GB transfer, $0.06/GB origin'],
    ['Supabase', 'supabase.com/pricing', 'Pro $25; 250 GB egress then $0.09/GB; 8 GB DB then $0.125/GB; computes Micro $10 ... XL $210; PITR $100'],
    ['Hetzner Cloud', 'hetzner.com/cloud/cost-optimized', 'CX23 &euro;5.99, CX33 &euro;8.99, CX43 &euro;16.49 (incl. IPv4, 20 TB traffic). <b>Every plan was shown "currently unavailable" - check stock before planning on it</b>'],
    ['Anthropic API', 'platform.claude.com/docs/en/about-claude/pricing', 'Sonnet 5.5 $2 in / $10 out per M tokens; Haiku 5.5 $0.10 / $0.50; Opus 5.5 $4 / $20; Fable 5.1 $10 / $50'],
    ['Paymob Egypt', 'paymob.com/en/online-payment (FAQ)', '2.75% + EGP 3 per successful card charge. No wallet rate, settlement time or refund fee is published: <b>ask Paymob for a written quote</b>'],
    ['Egypt Trust via Orange', 'orange.eg/.../digital-seal-and-digital-signature', 'Digital seal (needed for e-invoicing) EGP 2,000 / 1 yr new, 1,800 renew; signature EGP 1,000 / 800; token re-issue 500; all incl. VAT'],
    ['Cloudflare Registrar', 'cloudflare.com/products/registrar', 'Domains at registry cost, free WHOIS privacy; no .com price shown on the page (ESTIMATE about $10-12/yr)'],
], [30, 55, 95])]

# ---------------- section 2 load model ----------------
story += [P('2. What drives the cost: the load model', H2),
          P('The system, as built for Vercel, has every tablet and phone ask the server for the current state every 2-2.5 seconds (Vercel cannot hold open connections). Each ask is billed three times: as a CDN request, a function run, and a database read. So cost follows <b>requests per month</b>, not tables or cafés directly.'),
          T([['Assumption (per café)', 'Value', 'Basis'],
             ['Staff devices polling', f'{STAFF_DEV} every {STAFF_S}s', 'waiters, cashier, kitchen (code: 2 s captain/cashier, 2.5 s kitchen)'],
             ['Guest phones at peak', f'{GUEST_PEAK_PHONES}, half active', '30 tables, about half full, 3 phones each'],
             ['Peak requests/second', f1 if (f1 := f2(PEAK_RPS)) else '', 'staff + guests'],
             ['Average vs peak', f'{int(AVG_SHARE*100)}%', 'over a 12 h opening day (ESTIMATE)'],
             ['Requests per café per month', f'{REQ_CAFE/1e6:.1f} million', f'{AVG_RPS:.1f} req/s x {HOURS} h x {DAYS} days'],
             ['Poll size', '26 KB staff / 12.6 KB guest raw', '<b>measured</b> on the demo café; about %s KB after compression' % POLL_KB_COMPRESSED],
             ['Database row read per request', f'{ROW_KB:.0f} KB', '<b>measured</b>: 12.9 KB venue data (sales history is stored separately)']],
            [48, 42, 90]),
          P('These are estimates until a load test is run. If the real average is half of my assumption, every usage line in sections 3-4 halves; the fixed lines do not.', S)]

# ---------------- section 3 cost per architecture ----------------
def row(l, who, a): return [l, who, a]
for n in (10, 50):
    A, Bm, Cc = scenario(n, 'A'), scenario(n, 'B'), scenarioC(n)
    story += [PageBreak() if n == 50 else Spacer(1, 4), P(f'3.{1 if n==10 else 2} Monthly platform cost with {n} busy cafés (all 30 tables, Operations level)', H2)]
    v, s = A['v'], A['s']
    rows = [['Line', 'Cost to you / month (USD)', 'Notes']]
    rows += [
        ['<b>Option A - Vercel + Supabase as built</b>', '', f"{A['req']:.0f}M requests/month, {A['qps']:.0f} requests/s average"],
        ['Vercel Pro seat', usd(v['base']), '1 seat; credit of $20 is subtracted below'],
        ['CDN requests (10M incl., then $2.60/M in fra1)', usd(v['cdn']), ''],
        ['Function invocations ($0.60/M)', usd(v['inv']), 'no Pro allowance listed on the pricing page'],
        ['Fluid active CPU ($0.184/h)', usd(v['cpu']), f"assumed 12 ms CPU per request"],
        ['Provisioned memory ($0.0152/GB-h)', usd(v['mem']), 'assumed 1 GB x 80 ms per request'],
        ['Fast data transfer + origin transfer', usd(v['fdt'] + v['org']), f"{v['gb']:,.0f} GB; 1 TB included in transfer"],
        ['Included usage credit', '-$20', ''],
        ['Supabase Pro', usd(s['base']), ''],
        [f"Supabase compute ({s['compn']})", usd(s['comp'] - 10), '$10 monthly credit already deducted'],
        ['Supabase egress ($0.09/GB over 250 GB)', usd(s['egress']), f"{s['gb']:,.0f} GB read"],
        ['Domain, other', '$1', 'ESTIMATE'],
        ['<b>Total option A</b>', f"<b>{usd(A['total'])}</b> (EGP {f0(egp(A['total']))})", f"per café: {usd(A['total']/n)} / EGP {f0(egp(A['total']/n))}"]]
    v, s = Bm['v'], Bm['s']
    rows += [
        ['<b>Option B - same stack, polling made adaptive (-70% requests)</b>', '', f"{Bm['req']:.0f}M requests/month (work to build: about one day)"],
        ['Vercel (all lines, after $20 credit)', usd(v['total']), f"requests {usd(v['cdn'])}, runs {usd(v['inv'])}, CPU {usd(v['cpu'])}, memory {usd(v['mem'])}, transfer {usd(v['org']+v['fdt'])}"],
        [f"Supabase Pro + {s['compn']} + egress", usd(s['total']), f"egress {s['gb']:,.0f} GB"],
        ['Domain, other', '$1', ''],
        ['<b>Total option B</b>', f"<b>{usd(Bm['total'])}</b> (EGP {f0(egp(Bm['total']))})", f"per café: {usd(Bm['total']/n)} / EGP {f0(egp(Bm['total']/n))}"]]
    rows += [
        ['<b>Option C - own server (WebSocket mode) + Supabase</b>', '', 'Phones keep one connection; the server pushes changes; database touched only on real changes'],
        [f"Hetzner CX33 (4 vCPU / 8 GB) x {Cc['servers']}", usd(Cc['hz']), f"&euro;8.99 each at assumed $1.10/&euro;; <b>stock to be checked</b>"],
        ['Server backups', usd(Cc['bk']), 'from &euro;1.20 each (page: "starting at")'],
        ['Supabase Pro + small compute', usd(Cc['s']), 'low traffic: writes only'],
        ['Domain, Cloudflare free plan', '$1', 'ESTIMATE'],
        ['<b>Total option C</b>', f"<b>{usd(Cc['total'])}</b> (EGP {f0(egp(Cc['total']))})", f"per café: {usd(Cc['total']/n)} / EGP {f0(egp(Cc['total']/n))}. Plus your time for updates and uptime"]]
    story.append(T(rows, [78, 40, 62]))
    story.append(P('Option C trade-off: you operate it. Keep a second server and nightly backups; one process serves all cafés, so test restarts before opening it to paying venues.', S))

# ---------------- section 4 pricing ----------------
story += [PageBreak(), P('4. How to price the product so it cannot lose money', H2),
          P('<b>Formula.</b> Price per café per month = (hosting cost per café + AI cost + support allowance + payment-processing cost you carry) / (1 - target margin). Your own time and tax come after that.'),
          ]
A50, B50, C50 = scenario(50, 'A'), scenario(50, 'B'), scenarioC(50)
cost_cafe = {'A': A50['total'] / 50, 'B': B50['total'] / 50, 'C': C50['total'] / 50}
ai_cafe = 0.21   # haiku vip
support_allow = 0.0
rows = [['Hosting option', 'Hosting cost per busy café', 'Price needed at 50% margin', 'Price needed at 70% margin']]
for k, nm in (('A', 'A: as built'), ('B', 'B: adaptive polling'), ('C', 'C: own server')):
    c = cost_cafe[k]
    rows.append([nm, f"{usd(c)} = EGP {f0(egp(c))}", f"EGP {f0(egp(c/0.5))}", f"EGP {f0(egp(c/0.3))}"])
story += [T(rows, [38, 50, 46, 46]),
          P(f"With your current list prices (Basic EGP 350-500, Operations EGP 850-1,000, VIP EGP 1,450) <b>option A loses money on every busy café</b> (cost EGP {f0(egp(cost_cafe['A']))} per café). Option B is profitable. Option C leaves almost all of the price as margin.", NOTE)]
# revenue example
ops, vip = 35, 15
rev_egp = ops * 950 + vip * 1450
story += [P('4.1 Example: 50 paying cafés (35 Operations at EGP 950, 15 VIP at EGP 1,450)', H2)]
rows = [['', 'Option A', 'Option B', 'Option C'],
        ['Subscription revenue / month', f"EGP {f0(rev_egp)} (${rev_egp/FX:,.0f})"] + [''] * 2,
        ['Platform cost / month', f"{usd(A50['total'])}", f"{usd(B50['total'])}", f"{usd(C50['total'])}"],
        ['AI cost, 15 VIP cafés (Haiku 5.5)', usd(15 * ai_cafe), usd(15 * ai_cafe), usd(15 * ai_cafe)],
        ['Gross profit / month (USD)', usd(rev_egp / FX - A50['total'] - 15 * ai_cafe), usd(rev_egp / FX - B50['total'] - 15 * ai_cafe), usd(rev_egp / FX - C50['total'] - 15 * ai_cafe)],
        ['Gross profit / month (EGP)', f"EGP {f0(egp(rev_egp / FX - A50['total'] - 15 * ai_cafe))}", f"EGP {f0(egp(rev_egp / FX - B50['total'] - 15 * ai_cafe))}", f"EGP {f0(egp(rev_egp / FX - C50['total'] - 15 * ai_cafe))}"],
        ['Gross margin', f"{(rev_egp/FX - A50['total'] - 15*ai_cafe)/(rev_egp/FX)*100:.0f}%", f"{(rev_egp/FX - B50['total'] - 15*ai_cafe)/(rev_egp/FX)*100:.0f}%", f"{(rev_egp/FX - C50['total'] - 15*ai_cafe)/(rev_egp/FX)*100:.0f}%"]]
story += [T(rows, [58, 40, 40, 42]),
          P('Before this is "your income": subtract income tax and VAT treatment (accountant), your time for support, bank and transfer fees, and any money you pay people. Revenue also depends on how many cafés really pay on time: model 10% of cafés late or churned.', S),
          P('4.2 Break-even', H2),
          P(f"Fixed floor under option C is about {usd(C50['total'])}/month, i.e. <b>one or two Operations cafés</b> pay for the hosting. Under option A the cost grows with every café (about {usd(cost_cafe['A'])} each), so it never gets cheaper per café; under B about {usd(cost_cafe['B'])} each; under C it falls toward $1-2 per café."),
          P('4.3 Basic-tier cafés are almost free to host', H2),
          P('A Basic café (QR menu only) has no polling tablets and guests fetch the menu once per scan: roughly 10,000 requests a month, well under $1 of hosting. They are a pure-margin tier; the price of EGP 350-500 mostly pays for support.')]

# ---------------- section 5 add-ons ----------------
ai_q_sonnet = 3000 * 2 / 1e6 + 800 * 10 / 1e6
ai_q_haiku = 3000 * 0.10 / 1e6 + 800 * 0.50 / 1e6
scan_sonnet = 1500 * 2 / 1e6 + 2000 * 10 / 1e6
scan_haiku = 1500 * 0.10 / 1e6 + 2000 * 0.50 / 1e6
story += [PageBreak(), P('5. Extras and add-ons a café may ask for: what it costs you, what the café pays', H2),
          T([['Add-on', 'Cost to YOU', 'What the CAFÉ pays (vendor)', 'Suggested price to charge the café'],
             ['Online card / wallet payments (Paymob)', 'No per-payment cost; a few cents of hosting per thousand payments (ESTIMATE)', '<b>Paymob: 2.75% + EGP 3 per card charge</b> (published); wallet rate not published, ask Paymob. Example: EGP 200 bill = EGP 8.50 fee', 'Optional: free, or EGP 150/month, or 0.3-0.5% of online volume as a platform fee. Do not add it silently to the guest\'s bill'],
             ['ETA e-receipts', 'Hosting is negligible. Your cost is setup and support time', '<b>Digital seal (Egypt Trust via Orange): EGP 2,000 / 1 yr new, EGP 1,800 renew, incl. VAT</b> (about EGP 167/month). ETA itself: no API fee found', 'Setup EGP 1,000-2,500 once; EGP 150-250/month for monitoring and retries'],
             ['AI assistant (VIP) - Sonnet 5.5 as coded', f"${ai_q_sonnet:.3f} per question (EGP {egp(ai_q_sonnet):.2f}); 300 questions = ${300*ai_q_sonnet:.2f} / month", '-', 'Included in VIP'],
             ['AI assistant - Haiku 5.5 (set env ANTHROPIC_MODEL)', f"${ai_q_haiku:.4f} per question; 300 questions = ${300*ai_q_haiku:.2f} / month", '-', 'Same: included; about 20x cheaper than Sonnet'],
             ['AI menu photo scan', f"${scan_sonnet:.3f} per scan (Sonnet) / ${scan_haiku:.4f} (Haiku)", '-', 'First 3 scans free, then EGP 20 per scan or part of onboarding'],
             ['Extra branch', 'Under $1/month of hosting', '-', 'EGP 400-600 per branch per month (VIP includes 3)'],
             ['More tables / staff than the plan limit', 'Under $1/month', '-', 'Upgrade to the next tier, or EGP 15-25 per extra table per month'],
             ['Custom domain for the café', 'Domain registration, about $10-12 / year (ESTIMATE); Vercel adds no fee for the domain', 'Registrar price', 'EGP 600-900 per year including setup'],
             ['Menu entry / photo digitising', 'Your time (plus AI scan cost above)', '-', 'EGP 500-2,000 one-time depending on menu size'],
             ['On-site onboarding and staff training', 'Your time and transport', '-', 'EGP 1,000-3,000 one-time'],
             ['Printed table QR stands', '<b>No price found</b>: get a local print-shop quote', 'Print cost', 'Cost + 30-50% pass-through'],
             ['80 mm thermal printer + cash drawer', '<b>No price found</b>: get a local quote', 'Hardware', 'Pass-through at cost + 10-15%, or let the café buy it'],
             ['Extended database recovery (Supabase PITR)', '$100/month per 7 days of history, for the whole platform, not per café', '-', 'Only add once you have paying cafés that ask; spread over all cafés'],
             ['Priority support', 'Your time', '-', 'EGP 300-500/month if you want to sell it (WhatsApp channel is out of scope in this release)']],
            [36, 44, 52, 48]),
          P('Prices in the last column are <b>recommendations for you to decide</b>, based on typical practice; I have no market data for Egyptian competitors beyond what is in your master plan. Confirm with 3-5 cafés before publishing a price list.', S)]

# ---------------- section 6 budget ----------------
story += [P('6. What you pay, when: the budget to approve', H2)]
rowsB = [['Item', 'When', 'Option A (50 cafés)', 'Option B (50 cafés)', 'Option C (50 cafés)'],
         ['Platform hosting', 'monthly', usd(A50['total']), usd(B50['total']), usd(C50['total'])],
         ['Domain', 'yearly', '$12', '$12', '$12'],
         ['AI usage (15 VIP, Haiku)', 'monthly', usd(15 * ai_cafe), usd(15 * ai_cafe), usd(15 * ai_cafe)],
         ['<b>Monthly total</b>', '', f"<b>{usd(A50['total']+15*ai_cafe+1)}</b>", f"<b>{usd(B50['total']+15*ai_cafe+1)}</b>", f"<b>{usd(C50['total']+15*ai_cafe+1)}</b>"],
         ['<b>First-year cash (12 months + domain)</b>', '', f"<b>{usd((A50['total']+15*ai_cafe)*12+12)}</b>", f"<b>{usd((B50['total']+15*ai_cafe)*12+12)}</b>", f"<b>{usd((C50['total']+15*ai_cafe)*12+12)}</b>"]]
story += [T(rowsB, [50, 22, 36, 36, 36]),
          P('Pilot (first 10 cafés) on option A: ' + usd(scenario(10, 'A')['total']) + '/month; on option B: ' + usd(scenario(10, 'B')['total']) + '/month; on option C: ' + usd(scenarioC(10)['total']) + '/month. The Vercel and Supabase free plans cannot be used for paying cafés (Vercel Hobby is non-commercial per its own FAQ; Supabase Free is 500 MB).', B),
          P('Paid by each café, not by you: Paymob fees (2.75% + EGP 3), the e-signature / digital seal (EGP 2,000 first year), printers, QR printing.', B)]

story += [P('7. Authorisation checklist (nothing is purchased until you tick and tell me)', H2), T([
    ['', 'Item', 'Cost to you', 'Notes'],
    ['&#9744;', 'Vercel Pro (1 seat), region fra1', '$20/month + usage', 'needed for options A and B'],
    ['&#9744;', 'Supabase Pro, Frankfurt, one project', '$25/month + compute', 'all options'],
    ['&#9744;', 'Hetzner server(s) CX33', '&euro;8.99 each/month', 'option C only; verify stock first'],
    ['&#9744;', 'Domain (Cloudflare Registrar)', 'about $10-12/year', 'ESTIMATE until you see the price at checkout'],
    ['&#9744;', 'Anthropic API credit (pay as you go)', 'start with $20', 'cost grows only with AI use'],
    ['&#9744;', 'Paymob merchant account (per café)', 'no monthly fee published', 'get the written rate for wallets and settlement time'],
    ['&#9744;', 'ETA digital seal (per café)', 'EGP 2,000 first year', 'paid by the café'],
], [8, 70, 40, 62]),
    P('8. Things I could not confirm (do these before you commit)', H2),
    P('1) Today\'s EGP/USD rate. 2) Hetzner stock (all plans showed unavailable). 3) Paymob wallet fee, settlement time and refund fee: only the card rate is published. 4) Whether the Vercel included $20 credit and the 10M-request allowance apply exactly as the pages state when billed in fra1. 5) Real load: run a one-week simulated load test to replace my assumptions in section 2. 6) Egyptian VAT and income-tax treatment of your fees. 7) Printing and hardware prices (no source found).'),
    P('<b>My recommendation:</b> ship the polling reduction (option B) before the first paying café, run a load test, and plan the move to option C once you pass 15-20 busy cafés. Price Operations at EGP 950+ and keep VIP at EGP 1,450+ unless your accountant says otherwise.')]

# =================== PART 2: hardware, internet, setup decision ===================
def rng(a, b): return f"EGP {f0(a)}" if a == b else f"EGP {f0(a)} - {f0(b)}"
HW = [  # key, item, model, low, high, where found, confidence
    ('tab_hi', 'Cashier tablet 11"', 'Samsung Galaxy Tab A9+ (4-8 GB / 64-128 GB)', 11299, 13918, 'Amazon.eg 13,918; Noon 12,499-13,153; Ennap 11,299', 'Medium: retailer listings; samsung.com/eg showed no prices; one tracker said 8,810 (not used)'),
    ('tab_mid', 'Tablet 8.7" (kitchen / spare)', 'Samsung Galaxy Tab A9 (4 GB / 64 GB)', 7100, 8479, 'Ehab Group 8,479; Ennap 7,299; tv-it 7,100', 'Medium'),
    ('tab_lo', 'Budget cashier / kitchen tablet', 'Lenovo Tab M10 3rd gen 4G (4 GB / 64 GB)', 6299, 6999, 'XPRS 6,299; Noon M10 X505X 6,999', 'Medium'),
    ('phone', 'Waiter phone (optional: staff use their own)', 'Samsung Galaxy A06 / A07 / A16', 5800, 11900, 'A06 5,800-6,899; A07 9,700-11,900; A16 7,499-11,250 (Vodafone, Amazon.eg)', 'Low: wide spread between sellers'),
    ('prn_lo', 'Receipt printer 80 mm (budget)', 'Xprinter XP-80T USB / XP-N160II USB', 1899, 2750, 'Amazon.eg 1,899 (XP-80T); Amazon.eg/Noon 2,590-2,750 (XP-N160II)', 'Medium-high'),
    ('prn_hi', 'Receipt printer 80 mm (brand)', 'Epson TM-T20III USB', 5999, 10499, '2B 5,999 (out of stock); Egypt Laptop 6,199-8,699; United-Egypt 7,150; Amazon.eg 7,830-10,000; CairoPOS network 10,499', 'Medium: big spread, variant matters (-0011 USB, -012 network)'),
    ('drawer', 'Cash drawer RJ11/RJ12', 'Alfa ECH405G / GDA RJ-H4 / Zkteco ZKC0508E', 1299, 1899, 'Kimo Store 1,299-1,600; Trademark Egypt 1,899', 'Medium: width not stated on listings'),
    ('ups', 'UPS 650 VA (printer + router + tablet charger)', 'APC Easy UPS BV650', 2449, 3850, '2B 3,199; Noon 3,250; Egypt Laptop 2,449; MEST 3,850', 'Medium'),
    ('router', 'Wi-Fi 6 router', 'TP-Link Archer AX10 / AX23', 2999, 4250, 'Amazon.eg 3,600; egprices 2,999-4,250; AX23 3,850', 'Medium'),
    ('ap', 'Ceiling access point (per unit)', 'TP-Link EAP225 (Wi-Fi 5) / EAP610 (Wi-Fi 6)', 3199, 4140, 'Egypt Laptop 3,199; Amazon.eg 3,555-3,999; EAP610 4,099', 'Medium'),
    ('lte', '4G backup router', 'TP-Link TL-MR6400', 2875, 3999, 'Albadr 2,875; Amazon.eg 3,123; Noon 3,450; Jumia 3,999', 'Medium'),
    ('mon', '24-inch monitor (kitchen screen)', 'Samsung / Dell / MSI 24" FHD', 3375, 5799, 'Noon Dell 3,375; Jumia Samsung 4,850; MSI 5,799', 'Medium; needs a small Android box or mini-PC: no price found'),
]
H = {k: (lo, hi) for k, _, _, lo, hi, _, _ in HW}
def kit(items): return sum(H[k][0] * n for k, n in items), sum(H[k][1] * n for k, n in items)
KITS = [
    ('Starter (cashier only)', [('tab_lo', 1), ('prn_lo', 1), ('drawer', 1)], 'one till: budget tablet, budget printer, drawer. Waiters use their own phones; no kitchen screen (printed tickets or phone)'),
    ('Recommended (30-table café)', [('tab_hi', 1), ('prn_lo', 1), ('drawer', 1), ('ups', 1), ('tab_lo', 1), ('lte', 1), ('ap', 2)], 'Tab A9+ till, budget printer, drawer, UPS, Lenovo tablet as kitchen screen, 4G backup, two access points'),
    ('Premium', [('tab_hi', 2), ('prn_hi', 2), ('drawer', 1), ('ups', 2), ('mon', 1), ('tab_mid', 1), ('lte', 1), ('ap', 3), ('router', 1)], 'two tills with Epson printers, kitchen printer, monitor screen, 3 access points, new router'),
]

decision = [
    P('A. The decision (read this first)', H2),
    P('<b>Choose this and settle on it:</b>', B),
    T([['Phase', 'Setup', 'Why'],
       ['Now &rarr; about 15 busy cafés', '<b>Vercel Pro (region fra1) + Supabase Pro (Frankfurt), with the adaptive-polling change (option B)</b>', 'No servers to run, nothing to patch, deployment is one command, and you already run on it. About $%s/month at 50 cafés, $%s at 10. Frankfurt is the nearest Vercel region to Egypt that has regional pricing (others listed: Cape Town, Mumbai, Paris, London).' % (f0(B50['total']), f0(scenario(10, 'B')['total']))],
       ['From about 15-20 busy cafés &rarr; final target', '<b>Your own WebSocket server(s) on Hetzner (Germany) + Supabase Pro (option C), cafés split across servers by slug, Cloudflare in front</b>', 'Updates arrive instantly instead of every 2 s, the cost stops growing with polling (about $%s/month at 50 cafés), and one server holds all 50 cafés\' live state. It costs you operations time, so do it once you have revenue to justify a second machine and a checklist.' % f0(C50['total'])]],
      [34, 62, 84]),
    P(f"<b>Why not option A or staying on polling forever:</b> at 50 busy cafés it costs about {usd(A50['total'])}/month, more than your subscription income. <b>Why not C on day one:</b> a solo owner running a restaurant platform on a single machine has no safety net yet; downtime during dinner service hurts every café at once. Managed hosting buys you that safety while the product is young. The offline queue already built (F7) keeps waiters ordering through short outages on either setup.", NOTE),
    P('<b>Hardware to standardise on (café buys it; you list it as a recommended kit):</b> a Samsung Galaxy Tab A9+ as the till, an Xprinter 80 mm USB printer (Epson TM-T20III only for cafés that insist on a brand), an RJ11 cash drawer, a 650 VA UPS, a Lenovo Tab M10 as the kitchen screen, a TP-Link 4G backup router and two ceiling access points. <b>Buy one of each printer first and test it with the app before recommending anything:</b> the printing code uses WebUSB / WebSerial and I could not test a real printer.'),
]

hw = [PageBreak(), P('9. Hardware: prices found, per item (cost to YOU = EGP 0 unless you resell)', H2),
      P('Source: Egyptian retailers read on 29 Oct 2026 through web search (Amazon.eg, Noon, Jumia, 2B, Egypt Laptop, CairoPOS and others; links in the appendix). I could not open the product pages in a logged-in shopping session, so each number is a <b>listing snapshot</b>; samsung.com/eg returned an empty tablet list, so Samsung prices are retailer prices. Prices include Egyptian VAT as retailers show them. The café pays the retailer; you pay nothing unless you decide to resell.', S),
      T([['Item', 'Model', 'Price range found', 'Where found', 'Confidence']] + [[a, b, rng(lo, hi), w, c] for _, a, b, lo, hi, w, c in HW], [32, 38, 26, 54, 30]),
      P('Not found (no source): printed QR table stands in Egypt (international wholesale is $1.50-1.80 each at 100 pieces; retail $7-16, plus shipping and duties: get a local print quote), an Android TV box price for a kitchen screen, and business-fibre prices from Vodafone or Orange.', S),
      P('9.1 Café starter kits (what a café spends once)', H2)]
rows = [['Kit', 'Contents', 'Low (EGP)', 'High (EGP)', 'USD at EGP %s' % f0(FX)]]
for nm, items, desc in KITS:
    lo, hi = kit(items); rows.append([nm, desc, f0(lo), f0(hi), f"${lo/FX:,.0f} - ${hi/FX:,.0f}"])
hw += [T(rows, [30, 84, 20, 20, 26]),
       P('<b>If you resell the kit:</b> your cost is the retailer price above; a 10-15% handling margin plus delivery and setup is normal. Alternatively sell nothing and publish the kit as a recommended shopping list, which carries no stock risk, no warranty work and no VAT paperwork for you. For a first 10 cafés I recommend the list, not reselling.', NOTE),
       P('9.2 Internet at the café (café pays)', H2),
       P('The app is light: a staff tablet plus guests use roughly 0.5 Mbps at peak and about %.0f GB a month per busy café on the current polling design (%.1f M requests x 5 KB), far less on option C. What matters is a stable line, not speed. Telecom Egypt\'s business-labelled WE Space Super page lists 30 Mbps plans from EGP 210 (140 GB) to EGP 1,360 (1 TB) per month, VAT excluded; consumer WE Space Mega fibre starts at EGP 590 for 70 Mbps and 250 GB. I found no Vodafone or Orange business-fibre price list. <b>Recommend a fixed line plus a TP-Link MR6400 4G router (EGP 2,875-3,999) with a second operator SIM as backup</b>; get written quotes for your café addresses.' % (REQ_CAFE * POLL_KB_COMPRESSED / 1e6, REQ_CAFE / 1e6))]

cmp_rows = [['Criterion', 'A: Vercel + Supabase, polling as built', 'B: same, adaptive polling (recommended now)', 'C: own Hetzner WebSocket server + Supabase (recommended later)'],
            ['Monthly cost, 50 busy cafés', usd(A50['total']), usd(B50['total']), usd(C50['total'])],
            ['Monthly cost, 10 busy cafés', usd(scenario(10, 'A')['total']), usd(scenario(10, 'B')['total']), usd(scenarioC(10)['total'])],
            ['Order reaches the kitchen', 'up to about 2.5 s', 'about 1-5 s (fast right after an action)', 'instant (pushed)'],
            ['Distance from Egypt', 'Frankfurt (my estimate 40-70 ms, not verified; WonderNetwork has the Cairo-Frankfurt table)', 'same', 'Falkenstein / Nuremberg / Helsinki: similar'],
            ['You operate servers?', 'No', 'No', 'Yes: updates, backups, restarts, monitoring'],
            ['If it fails', 'Vercel / Supabase teams fix it', 'same', 'You fix it; all cafés on that server are down'],
            ['Scales with cafés', 'cost grows linearly', 'cost grows slowly', 'cost nearly flat; add a server per ~25-30 busy cafés (my estimate)'],
            ['Work still to build', 'none', 'about one day: slower guest polling, "nothing changed" replies', 'deployment scripts, process manager, backups, sharding by café; the WebSocket mode already exists in the code'],
            ['Risk', 'bill shock as cafés grow', 'low', 'medium until you have a runbook'],
            ['Verdict', 'Do not scale on it', '<b>Start here</b>', '<b>Move here at 15-20 busy cafés</b>']]
setup = [P('10. Setup comparison and decision table', H2), T(cmp_rows, [34, 46, 50, 50]),
         P('Hosting regions to set: Vercel functions <b>fra1</b>; Supabase project in <b>Frankfurt (eu-central-1)</b>; if you use Hetzner choose Falkenstein or Nuremberg (the cost-optimised plans were listed for NBG1 and HEL1). Put Cloudflare (free plan) in front of option C for DNS and basic protection. Keep nightly database backups on Supabase Pro (7 days included); add point-in-time recovery ($100 a month) only once cafés depend on it.', B),
         P('11. Final budget to approve (platform + one pilot café)', H2),
         T([['Item', 'Who pays', 'Amount'],
            ['Platform, first 10 cafés on option B', 'You', f"{usd(scenario(10, 'B')['total'])} / month"],
            ['Platform, 50 cafés on option B', 'You', f"{usd(B50['total'])} / month"],
            ['Platform, 50 cafés on option C', 'You', f"{usd(C50['total'])} / month"],
            ['Domain', 'You', 'about $12 / year (estimate)'],
            ['AI usage (VIP cafés, Haiku model)', 'You (include in VIP price)', f"about {usd(15*ai_cafe)} / month for 15 cafés"],
            ['Hardware: recommended kit', 'Café', f"EGP {f0(kit(KITS[1][1])[0])} - {f0(kit(KITS[1][1])[1])}"],
            ['Internet', 'Café', 'EGP 210 - 1,360 / month (WE Space Super, VAT excl.) or a fibre quote'],
            ['Paymob', 'Café', '2.75% + EGP 3 per card payment'],
            ['ETA digital seal', 'Café', 'EGP 2,000 first year (incl. VAT)'],
            ['Two test printers (one Xprinter, one Epson) before recommending', 'You, one-off', f"EGP {f0(H['prn_lo'][0] + H['prn_hi'][0])} - {f0(H['prn_lo'][1] + H['prn_hi'][1])}"]],
           [100, 40, 40]),
         P('12. Appendix: source links', H2),
         P('Vendor pricing: vercel.com/pricing; vercel.com/docs/pricing/regional-pricing/fra1; supabase.com/pricing; hetzner.com/cloud/cost-optimized; platform.claude.com/docs/en/about-claude/pricing; paymob.com/en/online-payment; orange.eg/en/business/business-solutions/digital-seal-and-digital-signature; cloudflare.com/products/registrar; te.eg (WE Space).<br/>'
           'Hardware listings: amazon.eg (Galaxy Tab A9 Plus, Epson TM-T20x, Xprinter XP-N160II, TP-Link Archer AX10, EAP225, EAP610, MR6400); noon.com/egypt-en (Tab A9 Plus, Tab A9, Xprinter, Lenovo Tab M10, UPS, Dell 24" monitor); ennap.com (Tab A9 / A9+); ehabgroup.com (Tab A9); myxprs.com (Lenovo Tab M10); egyptlaptop.com (Epson TM-T20III, EAP225, EAP610, UPS); 2b.com.eg (Epson TM-T20III, APC UPS); united-egypt.net (Epson); cairopos.com (Epson network); kimostore.net (cash drawers); trademark-eg.com (GDA drawer); jumia.com.eg (monitors, MR6400); egprices.com (Archer AX10 / AX23); eshop.vodafone.com.eg (Galaxy A16).', S)]

# insert decision after the cover block (cover = first 3 flowables), then append the rest before the final recommendation
story[3:3] = decision
story += hw + setup

def foot(c, d):
    c.saveState(); c.setFont('Helvetica', 7.5); c.setFillColor(colors.grey)
    c.drawString(15 * mm, 9 * mm, 'elmenue cost and pricing report - 29 Oct 2026 - estimates marked; confirm before paying'); c.drawRightString(195 * mm, 9 * mm, 'Page %d' % d.page); c.restoreState()
doc = SimpleDocTemplate(r'A:\Apps and Compilers\DigitalMenuApp\docs\elmenue_Cost_and_Pricing_Report.pdf', pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=14 * mm, bottomMargin=16 * mm, title='elmenue Cost and Pricing Report')
doc.build(story, onFirstPage=foot, onLaterPages=foot)
print('A50', A50['total'], 'B50', B50['total'], 'C50', C50['total'], 'A10', scenario(10, 'A')['total'], 'B10', scenario(10, 'B')['total'], 'C10', scenarioC(10)['total'])
