import { notFound } from 'next/navigation';
import { ROOM_ID_RE } from '@/lib/protocol';
import Room from '@/components/Room';

export default async function RoomPage({ params }: PageProps<'/room/[roomId]'>) {
  const { roomId } = await params;
  const id = roomId.toLowerCase();
  if (!ROOM_ID_RE.test(id)) notFound();

  return <Room roomId={id} />;
}
