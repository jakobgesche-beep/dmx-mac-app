// Enttec DMX USB PRO Paket-Framing laut offizieller "USB Pro API
// Specification": 0x7E, Label-Byte, 2 Byte Datenlänge (Little-Endian),
// Daten, 0xE7. Label 6 = "Output Only Send DMX Packet" (Daten = 1 Byte
// Startcode [0] + bis zu 512 Kanalwerte).
// Baudrate/Framing (250000/8/2/none) sind nach bestem Wissen aus der Spec
// übernommen, aber ungetestet an echter Hardware.
const NUM_CHANNELS = 512;
const SERIAL_OPTIONS = { baudRate: 250000, dataBits: 8, stopBits: 2, parity: "none" };

function buildEnttecPacket(label, data) {
  const len = data.length;
  const packet = new Uint8Array(4 + len + 1);
  packet[0] = 0x7e;
  packet[1] = label;
  packet[2] = len & 0xff;
  packet[3] = (len >> 8) & 0xff;
  packet.set(data, 4);
  packet[4 + len] = 0xe7;
  return packet;
}

function buildDmxOutputPacket(universe) {
  const data = new Uint8Array(1 + NUM_CHANNELS);
  data[0] = 0; // DMX-Startcode
  data.set(universe, 1);
  return buildEnttecPacket(6, data);
}

module.exports = { NUM_CHANNELS, SERIAL_OPTIONS, buildEnttecPacket, buildDmxOutputPacket };
