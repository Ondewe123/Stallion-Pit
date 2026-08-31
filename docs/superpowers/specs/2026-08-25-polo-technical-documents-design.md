# Polo VIN Profile and Technical Documents - Design

**Status:** Approved direction

**Vehicle:** 2004 Volkswagen Polo 9N 1.4 GT

**VIN:** `WVWZZZ9NZ4U010537`

**Confirmed factory codes:** BBY engine; GJG gearbox

## Purpose

Make Stallion Pit the reliable reference point for the owner's Polo. The Fleet record must show the authoritative vehicle identity, while the existing private Documents library must retain the supporting identification photographs and any legally obtained workshop information.

## Source and reliability rules

- The preferred source for repair information is Volkswagen erWin, searched by the exact VIN.
- An authorised Volkswagen/VAG workshop may supply the same official information when private erWin access is unavailable.
- Only manuals that identify the Polo 9N and are applicable to the BBY engine and GJG gearbox may be marked as vehicle-applicable.
- The app must show a document's source and applicability note; it must never imply that an unverified generic document is factory-correct.
- The app stores documents and photos supplied by the owner or legally obtained by the owner. It does not download or distribute copyrighted manuals from unofficial sources.

## Vehicle profile

The existing Polo vehicle row becomes the canonical location for its stable technical identity:

| Field | Value |
|---|---|
| Make/model | Volkswagen Polo 9N 1.4 GT |
| Model year | 2004 |
| VIN | WVWZZZ9NZ4U010537 |
| Engine code | BBY |
| Engine description | 1.4L 16V petrol (BBY) |
| Gearbox code | GJG |
| Transmission | Manual; exact gear count/specification to be taken from official vehicle data before being stated in the app |

The source/evidence note on the vehicle record will state that the VIN and gearbox photograph were supplied by the owner and the BBY/GJG codes were confirmed by the owner.

## Document library

Extend the existing vehicle-scoped `documents` table and upload flow rather than introducing a second file store. Add these kinds:

- Workshop Manual
- Maintenance Manual
- Wiring Diagram
- Technical Bulletin
- Identification Photo

Each technical document must also retain a title and free-text note. The note is used for the official source, VIN/model applicability, engine and gearbox coverage, and document edition/date.

The supplied VIN and gearbox photographs are uploaded to the Polo's private document area as `Identification Photo` records with clear titles. They are evidence only; no code is inferred from OCR at runtime.

## Fleet access

The Polo Fleet detail page continues to show technical specs in its existing grid. A small Technical documents section is added below the specifications when the selected vehicle has technical documents. It shows a document count, thumbnails for identification photographs where available, and an `Open Documents` action. Documents remains the full place for upload, download and deletion.

## Manual acquisition workflow

1. Register or sign in to Volkswagen erWin, or ask an authorised VAG workshop to perform the VIN lookup.
2. Enter `WVWZZZ9NZ4U010537` under vehicle identification.
3. Confirm the result identifies Polo 9N, engine BBY and gearbox GJG before purchasing/downloading anything.
4. Obtain the maintenance plan, workshop/repair manuals, wiring diagrams and relevant technical service information.
5. Upload each PDF to Stallion Pit as the matching technical document kind and include source, edition/date and applicability in the note.

## Acceptance criteria

- The live Polo record shows the confirmed VIN, BBY engine and GJG gearbox.
- Both supplied identification photographs are preserved in the Polo's private Documents library.
- Users can classify workshop, maintenance, wiring and bulletin documents without using the generic `Other` type.
- Fleet indicates when technical documents are available and links to them.
- Existing non-technical document upload, download, preview and deletion flows continue to work.
- Unit tests cover document-kind helpers and Fleet technical-document presentation logic; the production build succeeds.

## Out of scope

- Downloading manuals from Volkswagen or any third-party site.
- Claiming a maintenance interval, torque value or wiring configuration without a verified official document.
- Creating a separate Manuals navigation page in this first release.
