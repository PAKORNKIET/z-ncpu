# Days-in-month lookup table

The switches hold a month number (1–12). Show the **number of days** (28 for February); show **0** for an invalid month. Build a table in RAM at start-up (Z8 keeps program and data apart), then read it with `LOAD B, [A]`, using the month as part of the address.
