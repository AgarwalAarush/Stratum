# Recommendation timeline design

Generated with the built-in image generator before implementation. The reference
is `recommendation-aging-mock.png`; all securities, dates, returns and portfolios
in the mock are illustrative. Production screenshots are kept outside Git.

Prompt summary: extend Stratum's existing monochrome desktop Track record view
at 1672 × 941 with named recommendation versions, Security / Checkpoint / Status
filters, seven calendar checkpoints, evidence coverage, independent economic
forecast resolution, and hypothetical versus reported execution. Preserve the
existing shell, Forecast review and Controlled learning. Use fictional EXAMPLE
and SAMPLE data, no personal financial information.

The implementation uses semantic HTML and the existing theme variables. It does
not ship the generated image as a background. At 390 pixels the filters wrap and
checkpoint disclosures use two columns. The actual issue date determines every
anniversary; absent schedules, prices and owner reports remain explicitly absent.
The recent-version window and assessment bounds are visible. Source citation
counts do not claim complete coverage or factual correctness.
