"""Write the disposal fixture and the bust fixture used by the ASCII tool."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / 'fixtures'


def pack_bits(codes, code_size_at_start):
    bits = 0
    count = 0
    out = bytearray()

    def write(code, size):
        nonlocal bits, count
        bits |= code << count
        count += size
        while count >= 8:
            out.append(bits & 0xFF)
            bits >>= 8
            count -= 8

    # codes is a list of (code, size) so the size can grow between writes.
    for code, size in codes:
        write(code, size)
    if count:
        out.append(bits & 0xFF)
    return bytes(out)


def lzw(pixels, min_code_size):
    clear = 1 << min_code_size
    eoi = clear + 1
    code_size = min_code_size + 1
    next_code = eoi + 1
    table = {bytes([i]): i for i in range(clear)}
    codes = [(clear, code_size)]
    if not pixels:
        codes.append((eoi, code_size))
        return pack_bits(codes, code_size)

    word = bytes([pixels[0]])
    for value in pixels[1:]:
        candidate = word + bytes([value])
        if candidate in table:
            word = candidate
            continue
        codes.append((table[word], code_size))
        if next_code < 4096:
            table[candidate] = next_code
            next_code += 1
            # The decoder widens the code after the new table index no longer fits.
            if next_code > (1 << code_size) and code_size < 12:
                code_size += 1
        else:
            codes.append((clear, code_size))
            table = {bytes([i]): i for i in range(clear)}
            code_size = min_code_size + 1
            next_code = eoi + 1
        word = bytes([value])
    codes.append((table[word], code_size))
    codes.append((eoi, code_size))
    return pack_bits(codes, code_size)


def subblocks(data):
    out = bytearray()
    for start in range(0, len(data), 255):
        chunk = data[start:start + 255]
        out.append(len(chunk))
        out.extend(chunk)
    out.append(0)
    return bytes(out)


def gif(width, height, colors, background, frames, min_code_size):
    packed = 0x80 | 0x70 | (len(colors).bit_length() - 2)
    out = bytearray(b'GIF89a')
    out += width.to_bytes(2, 'little')
    out += height.to_bytes(2, 'little')
    out += bytes((packed, background, 0))
    for color in colors:
        out += bytes(color)
    for frame in frames:
        disposal = frame['disposal'] & 7
        transparent = frame.get('transparent')
        flags = disposal << 2
        if transparent is not None:
            flags |= 1
        delay = frame['delay_cs']
        out += bytes((0x21, 0xF9, 0x04, flags, delay & 0xFF, delay >> 8, 0 if transparent is None else transparent, 0))
        left, top, frame_width, frame_height = frame['rect']
        out += bytes((0x2C,))
        out += left.to_bytes(2, 'little')
        out += top.to_bytes(2, 'little')
        out += frame_width.to_bytes(2, 'little')
        out += frame_height.to_bytes(2, 'little')
        out += bytes((0, min_code_size))
        out += subblocks(lzw(frame['pixels'], min_code_size))
    out += bytes((0x3B,))
    return bytes(out)


def disposal_gif():
    # 0 white, 1 black, 2 red, 3 blue, 4 transparent.
    colors = [(255, 255, 255), (0, 0, 0), (255, 0, 0), (0, 0, 255)] + [(0, 0, 0)] * 4
    full = [1] * (6 * 4)
    full[0] = 0
    return gif(6, 4, colors, 0, [
        {'rect': (0, 0, 6, 4), 'pixels': full, 'disposal': 1, 'delay_cs': 10, 'transparent': 4},
        {'rect': (2, 1, 2, 2), 'pixels': [2, 2, 2, 4], 'disposal': 2, 'delay_cs': 10, 'transparent': 4},
        {'rect': (0, 1, 1, 1), 'pixels': [3], 'disposal': 1, 'delay_cs': 10, 'transparent': 4},
        {'rect': (5, 0, 1, 1), 'pixels': [2], 'disposal': 3, 'delay_cs': 10, 'transparent': 4},
        {'rect': (5, 3, 1, 1), 'pixels': [3], 'disposal': 1, 'delay_cs': 10, 'transparent': 4},
    ], 3)


def render_bust(dx, blink):
    image = Image.new('RGB', (180, 240), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    cx = 90 + dx
    draw.ellipse((cx - 54, 24, cx + 54, 148), fill=(0, 0, 0))
    draw.ellipse((cx - 62, 78, cx - 42, 108), fill=(0, 0, 0))
    draw.ellipse((cx + 42, 78, cx + 62, 108), fill=(0, 0, 0))
    draw.rectangle((cx - 16, 136, cx + 16, 186), fill=(0, 0, 0))
    draw.polygon([(8, 239), (24, 176), (cx, 166), (156, 176), (172, 239)], fill=(0, 0, 0))
    if not blink:
        draw.rectangle((cx - 30, 70, cx - 12, 86), fill=(255, 255, 255))
        draw.rectangle((cx + 12, 70, cx + 30, 86), fill=(255, 255, 255))
        draw.rectangle((cx - 5, 96, cx + 5, 112), fill=(255, 255, 255))
        draw.rectangle((cx - 20, 118, cx + 20, 128), fill=(255, 255, 255))
    return image


def bust_gif():
    palette = Image.new('P', (1, 1))
    palette.putpalette([255, 255, 255, 0, 0, 0] + [0, 0, 0] * 254)
    shifts = [-8, -6, -3, -1, 2, 5, 8, 4, 1, 0]
    frames = [
        render_bust(shifts[index], index == 7).quantize(palette=palette, dither=Image.Dither.NONE)
        for index in range(10)
    ]
    buffer = __import__('io').BytesIO()
    frames[0].save(
        buffer,
        format='GIF',
        save_all=True,
        append_images=frames[1:],
        duration=120,
        disposal=1,
        optimize=True,
        loop=0,
    )
    return buffer.getvalue()


def main():
    FIXTURES.mkdir(exist_ok=True)
    (FIXTURES / 'disposal.gif').write_bytes(disposal_gif())
    (FIXTURES / 'bust.gif').write_bytes(bust_gif())
    print(f'wrote {FIXTURES / "disposal.gif"} and {FIXTURES / "bust.gif"}')


if __name__ == '__main__':
    main()
