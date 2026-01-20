import MenuClient from "./MenuClient";

type Props = {
  params: Promise<{ restaurantId: string }>;
};

export default async function Page({ params }: Props) {
  const { restaurantId } = await params;
  return <MenuClient restaurantId={restaurantId} />;
}
