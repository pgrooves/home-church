#!/usr/bin/env python3
"""
Enough of PlistBuddy to test scripts/ios_plist.js away from a Mac.

Used only by tests/ios-plist-writer.test.js, through the HC_PLIST_BUDDY
environment variable. It implements the three commands that script sends —
Print, Add, Set — with the same exit codes the real one uses, and it reads and
writes the file with Python's plistlib, which is an independent plist parser.
That second part is the point: if this repo's own reader in
scripts/preflight.js and a real parser ever disagree about where a key is,
the test suite says so rather than Apple's upload validator.

    fake-plistbuddy.py -c "Print :KEY" file.plist
    fake-plistbuddy.py -c "Add :KEY string some words" file.plist
    fake-plistbuddy.py -c "Add :KEY bool true" file.plist
    fake-plistbuddy.py -c "Set :KEY some words" file.plist

Exits 1 with a message on a Print of a key that is not there, and on an Add
of one that already is, which is what the real PlistBuddy does and what the
script's Add-or-Set branch depends on.
"""

import plistlib
import sys


def main(argv):
    if len(argv) != 4 or argv[1] != '-c':
        sys.stderr.write('usage: -c "<command>" <file>\n')
        return 2

    command, path = argv[2], argv[3]

    with open(path, 'rb') as handle:
        root = plistlib.load(handle)

    verb, rest = (command.split(' ', 1) + [''])[:2]
    rest = rest.strip()

    if verb == 'Print':
        key = rest.lstrip(':')
        if key not in root:
            sys.stderr.write('Print: Entry, ":%s", Does Not Exist\n' % key)
            return 1
        value = root[key]
        if isinstance(value, bool):
            sys.stdout.write('true\n' if value else 'false\n')
        else:
            sys.stdout.write('%s\n' % value)
        return 0

    if verb in ('Add', 'Set'):
        parts = rest.split(' ', 2)
        key = parts[0].lstrip(':')

        if verb == 'Add':
            if key in root:
                sys.stderr.write('Add: ":%s" Entry Already Exists\n' % key)
                return 1
            kind = parts[1] if len(parts) > 1 else 'string'
            raw = parts[2] if len(parts) > 2 else ''
            root[key] = (raw.strip().lower() == 'true') if kind == 'bool' else raw
        else:
            if key not in root:
                sys.stderr.write('Set: Entry, ":%s", Does Not Exist\n' % key)
                return 1
            raw = rest[len(parts[0]):].strip()
            if isinstance(root[key], bool):
                root[key] = raw.lower() == 'true'
            else:
                root[key] = raw

        with open(path, 'wb') as handle:
            plistlib.dump(root, handle)
        return 0

    sys.stderr.write('Unrecognized Command\n')
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
