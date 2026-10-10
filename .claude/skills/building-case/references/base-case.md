# The base case

The base case is the honest central estimate: defensible, sourced, neither
promotional nor punitive. It is what you actually believe the business does,
not a number pre-discounted for safety. The margin of safety is applied
separately and visibly by the advisor, as a required discount from this value,
so discounting the inputs as well double-counts and hides how large the real
margin is.

- **Management guidance is admissible evidence**, weighted by the company's
  delivery record. Checklist question G3 ("what did management promise five
  years ago, and what happened") is the test. Say in `rationale` what weight
  you gave it and why. Ignoring guidance wholesale replaces one judgement with
  another and calls the substitution conservative.
- **Argue terminal growth for this company** in `terminal.basis`, and never
  default it. Terminal value routinely runs 65 to 85 percent of the total, so
  that single figure is most of the valuation. When `results.json` shows
  `terminalValuePctOfEv` above 0.65, say so in the basis and justify the
  figure specifically.
- **Credit a serial acquirer's redeployment engine** where the filed record
  shows capital deployed at returns above the cost of capital. Charge the
  acquisitions needed to replace decaying units as capex and credit the
  return. Charging the capital while crediting nothing is not conservatism; it
  is an error.
- **Derive the fade curve; do not copy it.** The growth and margin paths are
  ten numbers each because the company's path is its own. If two cases written
  in one sweep end up with the same curve shape, say why in `rationale`.
- **The one case for anchoring low:** a levered serial acquirer with a weak
  organic record and acquisition-fuelled reported growth. Anchor on the filed
  organic record there. That is a judgement about a business shape, not a
  general posture.

For `normalisedEarnings`: take the margin range from the reported margin
history and name the years behind it in `rationale`; take the EV/EBIT range
from peers in the facts or a cited sector table; use `multipleCeiling` as your
own guard against paying a peak-cycle multiple.

For `nav`: `warrantedDiscount` is the discount the market has historically
applied to this company's reported NAV, sourced, and argued in `rationale` if
you depart from it.
