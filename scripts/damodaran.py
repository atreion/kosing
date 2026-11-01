"""Cache one Damodaran table in the data repo as the file he published plus a CSV.

    python3 -I scripts/damodaran.py betas <region> <file.xls> <cache dir>
    python3 -I scripts/damodaran.py country <YYYY-MM> <file.xlsx> <cache dir>

The cache dir is $DATA_PATH/reference/damodaran. A table lands in the month
of its edition: a beta table's own "Date updated" cell, or the month a
country-premium edition is labelled with on his data page (the date cell in
that workbook is a stale template value). Python's standard library only, so
the researcher's agents can run it anywhere; Node has no .xls reader either.
"""

import csv
import datetime
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile

COUNTRY_COLUMNS = [
    "country",
    "region",
    "moodysRating",
    "ratingDefaultSpread",
    "totalEquityRiskPremium",
    "countryRiskPremium",
    "cdsSpreadNetOfSwiss",
    "totalEquityRiskPremiumCds",
    "countryRiskPremiumCds",
]

# --- .xlsx: a zip of XML parts ------------------------------------------------

XLSX_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}


def xlsx_sheets(path):
    archive = zipfile.ZipFile(path)
    shared = xlsx_shared_strings(archive)
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rels = {
        r.get("Id"): r.get("Target")
        for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    }
    sheets = {}
    for sheet in workbook.find("m:sheets", XLSX_NS):
        target = rels[sheet.get("{%s}id" % XLSX_NS["r"])].lstrip("/")
        part = target if target.startswith("xl/") else "xl/" + target
        sheets[sheet.get("name")] = xlsx_rows(ET.fromstring(archive.read(part)), shared)
    return sheets


def xlsx_shared_strings(archive):
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    return [
        "".join(t.text or "" for t in si.iter("{%s}t" % XLSX_NS["m"]))
        for si in root.findall("m:si", XLSX_NS)
    ]


def xlsx_rows(sheet, shared):
    rows = []
    for row in sheet.iter("{%s}row" % XLSX_NS["m"]):
        cells = {}
        for cell in row.findall("m:c", XLSX_NS):
            value = xlsx_cell(cell, shared)
            if value is not None:
                cells[column_index(cell.get("r"))] = value
        if cells:
            rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
    return rows


def xlsx_cell(cell, shared):
    kind = cell.get("t")
    if kind == "inlineStr":
        return "".join(t.text or "" for t in cell.iter("{%s}t" % XLSX_NS["m"]))
    value = cell.find("m:v", XLSX_NS)
    if value is None:
        return None
    return shared[int(value.text)] if kind == "s" else value.text


def column_index(ref):
    index = 0
    for letter in re.match(r"[A-Z]+", ref).group():
        index = index * 26 + ord(letter) - 64
    return index - 1


# --- .xls: BIFF8 records inside an OLE compound file --------------------------

END_OF_CHAIN = 0xFFFFFFFE


def compound_stream(data, names=("Workbook", "Book")):
    if data[:8] != bytes.fromhex("D0CF11E0A1B11AE1"):
        raise ValueError("not an OLE compound file")
    size = 1 << struct.unpack_from("<H", data, 30)[0]
    fat_sectors, dir_start = struct.unpack_from("<I", data, 44)[0], struct.unpack_from("<I", data, 48)[0]
    difat_start, difat_count = struct.unpack_from("<II", data, 68)

    def sector(i):
        return data[512 + i * size : 512 + (i + 1) * size]

    difat = list(struct.unpack_from("<109I", data, 76))
    next_difat = difat_start
    for _ in range(difat_count):
        entries = struct.unpack("<%dI" % (size // 4), sector(next_difat))
        difat += entries[:-1]
        next_difat = entries[-1]
    fat = []
    for i in difat[:fat_sectors]:
        fat += struct.unpack("<%dI" % (size // 4), sector(i))

    def chain(start):
        parts = []
        while start != END_OF_CHAIN and start < len(fat):
            parts.append(sector(start))
            start = fat[start]
        return b"".join(parts)

    directory = chain(dir_start)
    for offset in range(0, len(directory), 128):
        entry = directory[offset : offset + 128]
        name_length = struct.unpack_from("<H", entry, 64)[0]
        if entry[: max(name_length - 2, 0)].decode("utf-16-le") in names:
            start, length = struct.unpack_from("<II", entry, 116)
            if length < 4096:
                raise ValueError("workbook in the mini stream is not supported")
            return chain(start)[:length]
    raise ValueError("no workbook stream")


def biff_records(stream):
    offset = 0
    while offset + 4 <= len(stream):
        kind, length = struct.unpack_from("<HH", stream, offset)
        yield offset, kind, stream[offset + 4 : offset + 4 + length]
        offset += 4 + length


def rk_number(value):
    if value & 2:
        integer = value >> 2
        number = integer - (1 << 30) if integer & (1 << 29) else integer
    else:
        number = struct.unpack("<d", struct.pack("<Q", (value & 0xFFFFFFFC) << 32))[0]
    return number / 100 if value & 1 else number


def short_string(payload, offset, length):
    wide = payload[offset] & 1
    raw = payload[offset + 1 : offset + 1 + length * (2 if wide else 1)]
    return raw.decode("utf-16-le" if wide else "latin-1")


def shared_strings(parts):
    """The SST record and its CONTINUEs. A string split across a CONTINUE
    restarts with a one-byte width flag, which is what the cursor tracks."""
    count = struct.unpack_from("<I", parts[0], 4)[0]
    part, pos = 0, 8
    strings = []

    def ensure(n):
        nonlocal part, pos
        if pos + n > len(parts[part]):
            part, pos = part + 1, 0

    for _ in range(count):
        ensure(3)
        payload = parts[part]
        length = struct.unpack_from("<H", payload, pos)[0]
        flags = payload[pos + 2]
        pos += 3
        runs = extension = 0
        if flags & 8:
            runs = struct.unpack_from("<H", payload, pos)[0]
            pos += 2
        if flags & 4:
            extension = struct.unpack_from("<I", payload, pos)[0]
            pos += 4
        chars, wide = [], flags & 1
        while length > 0:
            if pos >= len(parts[part]):
                part, pos = part + 1, 1
                wide = parts[part][0] & 1
            width = 2 if wide else 1
            take = min(length, (len(parts[part]) - pos) // width)
            chars.append(parts[part][pos : pos + take * width].decode("utf-16-le" if wide else "latin-1"))
            pos += take * width
            length -= take
        strings.append("".join(chars))
        skip = runs * 4 + extension
        while skip > 0:
            if pos >= len(parts[part]):
                part, pos = part + 1, 0
            step = min(skip, len(parts[part]) - pos)
            pos += step
            skip -= step
    return strings


def xls_sheets(path):
    records = list(biff_records(compound_stream(open(path, "rb").read())))
    bounds, strings = [], []
    for i, (_, kind, payload) in enumerate(records):
        if kind == 0x85 and payload[5] == 0:
            bounds.append((struct.unpack_from("<I", payload)[0], short_string(payload, 7, payload[6])))
        if kind == 0xFC:
            parts = [payload]
            j = i + 1
            while records[j][1] == 0x3C:
                parts.append(records[j][2])
                j += 1
            strings = shared_strings(parts)
    index_at = {offset: i for i, (offset, _, _) in enumerate(records)}
    return {name: xls_rows(records, index_at[start], strings) for start, name in bounds}


def xls_rows(records, start, strings):
    cells, formula_cell = {}, None
    for _, kind, p in records[start:]:
        if kind == 0x0A:
            break
        if kind == 0xFD:
            row, col, _, k = struct.unpack_from("<HHHI", p)
            cells[(row, col)] = strings[k]
        elif kind == 0x203:
            row, col, _, value = struct.unpack_from("<HHHd", p)
            cells[(row, col)] = value
        elif kind == 0x27E:
            row, col, _, value = struct.unpack_from("<HHHI", p)
            cells[(row, col)] = rk_number(value)
        elif kind == 0xBD:
            row, col = struct.unpack_from("<HH", p)
            for k in range((len(p) - 6) // 6):
                cells[(row, col + k)] = rk_number(struct.unpack_from("<I", p, 4 + k * 6 + 2)[0])
        elif kind == 0x204:
            row, col, _, length = struct.unpack_from("<HHHH", p)
            cells[(row, col)] = short_string(p, 8, length)
        elif kind == 0x06:
            row, col = struct.unpack_from("<HH", p)
            result = p[6:14]
            if result[6:8] != b"\xff\xff":
                cells[(row, col)] = struct.unpack("<d", result)[0]
            elif result[0] == 0:
                formula_cell = (row, col)
            elif result[0] == 1:
                cells[(row, col)] = bool(result[2])
        elif kind == 0x207 and formula_cell is not None:
            cells[formula_cell] = short_string(p, 2, struct.unpack_from("<H", p)[0])
            formula_cell = None
    if not cells:
        return []
    width = max(col for _, col in cells) + 1
    rows = [[cells.get((r, c), "") for c in range(width)] for r in range(max(r for r, _ in cells) + 1)]
    return [row for row in rows if any(cell != "" for cell in row)]


# --- tables -------------------------------------------------------------------


def text(cell):
    if isinstance(cell, float):
        return str(int(cell)) if cell == int(cell) else repr(round(cell, 10))
    value = str(cell).strip()
    try:
        number = float(value)
    except ValueError:
        return value
    return text(number) if re.fullmatch(r"-?[\d.]+(E-?\d+)?", value) else value


def excel_date(serial):
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(float(serial)))


def beta_table(path):
    rows = xls_sheets(path)["Industry Averages"]
    month = excel_date(rows[0][1]).strftime("%Y-%m")
    header_at = next(i for i, r in enumerate(rows) if str(r[0]).strip().startswith("Industry"))
    header = [text(c) for c in rows[header_at] if str(c).strip()]
    body = [[text(c) for c in r[: len(header)]] for r in rows[header_at + 1 :]]
    return month, [header, *body]


def country_table(path):
    rows = xlsx_sheets(path)["ERPs by country"]
    header_at = next(i for i, r in enumerate(rows) if r and r[0] == "Country")
    body = []
    for row in rows[header_at + 1 :]:
        if len(row) < 6 or not row[0] or not row[1]:
            break
        body.append([text(c) for c in (row + [""] * 9)[:9]])
    summary = "mature ERP %s, US ERP %s, volatility multiplier %s" % (
        text(rows[2][4]),
        text(rows[3][4]),
        text(rows[5][4]),
    )
    return [COUNTRY_COLUMNS, *body], summary


def store(cache, month, name, source, extension, table):
    directory = os.path.join(cache, month)
    os.makedirs(directory, exist_ok=True)
    with open(source, "rb") as original, open(os.path.join(directory, name + extension), "wb") as copy:
        copy.write(original.read())
    with open(os.path.join(directory, name + ".csv"), "w", newline="") as out:
        csv.writer(out, lineterminator="\n").writerows(table)
    return os.path.join(directory, name + ".csv")


def main(argv):
    if len(argv) != 5 or argv[1] not in ("betas", "country"):
        sys.exit(__doc__)
    kind, label, source, cache = argv[1:]
    if kind == "betas":
        month, table = beta_table(source)
        path = store(cache, month, "betas-" + label, source, ".xls", table)
        print("%s: %d industries, Date updated %s" % (path, len(table) - 1, month))
    else:
        if not re.fullmatch(r"\d{4}-\d{2}", label):
            sys.exit("country needs the edition month as YYYY-MM")
        table, summary = country_table(source)
        path = store(cache, label, "country-risk", source, ".xlsx", table)
        print("%s: %d countries, %s" % (path, len(table) - 1, summary))


if __name__ == "__main__":
    main(sys.argv)
