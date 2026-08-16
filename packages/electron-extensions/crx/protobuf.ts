const WIRE_TYPE_VARINT = 0;

const WIRE_TYPE_FIXED64 = 1;

const WIRE_TYPE_LENGTH_DELIMITED = 2;

const WIRE_TYPE_FIXED32 = 5;

export type ProtobufField = {
  fieldNumber: number;
  bytes: Uint8Array;
};

function readVarint(message: Uint8Array, offset: number) {
  let value = 0;

  let shift = 0;

  let cursor = offset;

  while (cursor < message.byteLength) {
    const byte = message[cursor] as number;

    cursor += 1;

    value += (byte & 0x7f) * 2 ** shift;

    if ((byte & 0x80) === 0) {
      return { value, nextOffset: cursor };
    }

    shift += 7;
  }

  throw new Error("Protobuf varint runs past the end of the message");
}

/**
 * The length-delimited fields of a protobuf message, paired with their field
 * numbers and in the order they were written. Fields of other wire types are
 * skipped, since the CRX schema puts nothing this package needs in them.
 *
 * Everything the parse cannot account for throws instead of returning what it
 * managed to read: a header that is not shaped like a header must never be
 * mistaken for one carrying no proofs, which is a header nothing vouches for.
 *
 * Reading the few fields a CRX is made of by hand is what keeps this package
 * free of a protobuf dependency.
 */
export function readLengthDelimitedFields(message: Uint8Array) {
  const fields: ProtobufField[] = [];

  let cursor = 0;

  while (cursor < message.byteLength) {
    const { value: fieldKey, nextOffset } = readVarint(message, cursor);

    cursor = nextOffset;

    const fieldNumber = fieldKey >>> 3;

    const wireType = fieldKey & 0x7;

    if (wireType === WIRE_TYPE_VARINT) {
      cursor = readVarint(message, cursor).nextOffset;

      continue;
    }

    if (wireType === WIRE_TYPE_FIXED64 || wireType === WIRE_TYPE_FIXED32) {
      cursor += wireType === WIRE_TYPE_FIXED64 ? 8 : 4;

      continue;
    }

    if (wireType !== WIRE_TYPE_LENGTH_DELIMITED) {
      throw new Error(`Protobuf field ${fieldNumber} has unsupported wire type ${wireType}`);
    }

    const { value: fieldLength, nextOffset: afterLength } = readVarint(message, cursor);

    const fieldEnd = afterLength + fieldLength;

    if (fieldEnd > message.byteLength) {
      throw new Error(`Protobuf field ${fieldNumber} runs past the end of the message`);
    }

    fields.push({ fieldNumber, bytes: message.subarray(afterLength, fieldEnd) });

    cursor = fieldEnd;
  }

  return fields;
}
