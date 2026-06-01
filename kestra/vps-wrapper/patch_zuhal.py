path = "/app/pipeline/zuhal_dispatcher.py"
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

out = []
i = 0
patched_429 = False
while i < len(lines):
    line = lines[i]
    if not patched_429 and line.strip() == "if exc.status == 429:":
        indent = line[: len(line) - len(line.lstrip())]
        out.append(f"{indent}if exc.status == 429:\n")
        out.append(f"{indent}    self._zuhal_429_counts[unique_id] = self._zuhal_429_counts.get(unique_id, 0) + 1\n")
        out.append(f"{indent}    if self._zuhal_429_counts[unique_id] >= 3:\n")
        out.append(f"{indent}        logger.warning('Zuhal 429 x3 giving up on %s marking failed', unique_id)\n")
        out.append(f"{indent}        async with self._write_lock:\n")
        out.append(f"{indent}            await db.update_record_status(self.conn, unique_id, State.VALIDATION_FAILED)\n")
        out.append(f"{indent}        self.stats['validation_failed'] += 1\n")
        out.append(f"{indent}        self._zuhal_429_counts.pop(unique_id, None)\n")
        out.append(f"{indent}    else:\n")
        out.append(f"{indent}        async with self._write_lock:\n")
        out.append(f"{indent}            await db.requeue_zuhal(self.conn, unique_id)\n")
        out.append(f"{indent}        self.stats['requeued'] += 1\n")
        out.append(f"{indent}        logger.warning('Zuhal 429 (%d/3) re-queued %s', self._zuhal_429_counts[unique_id], unique_id)\n")
        out.append(f"{indent}    return\n")
        i += 4
        patched_429 = True
        print("Patched 429 block OK")
        continue
    out.append(line)
    i += 1

result = "".join(out)

# Check specifically for the __init__ declaration (distinct from handler usage)
init_decl = "self._zuhal_429_counts: dict[str, int] = {}"
if init_decl not in result:
    result = result.replace(
        "        self.stats: dict[str, int] = {",
        "        self._zuhal_429_counts: dict[str, int] = {}\n        self.stats: dict[str, int] = {",
        1,
    )
    print("Patched __init__ OK")
else:
    print("__init__ already patched")

if not patched_429:
    print("ERROR: 429 block not found")
    raise SystemExit(1)

with open(path, "w", encoding="utf-8") as f:
    f.write(result)
print("Done")
