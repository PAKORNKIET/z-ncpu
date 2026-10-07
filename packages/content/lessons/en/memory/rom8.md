# ROM8

A ROM returns the 16-bit instruction stored at addr. The program comes from a **constant panel** (like the switch panels of early computers) through the 128-bit **data bundle**: word 0 is bits 0–15, word 1 is bits 16–31, and so on. The level attaches a panel with sample data; the test loads two random programs and reads every address. Build it as a 3-level tree of 16-bit MUXes.
