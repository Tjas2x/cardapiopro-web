import { redirect } from "next/navigation";

type Props = {
  params: { restaurantId: string };
};

export default function RestaurantRedirectPage({ params }: Props) {
  redirect(`/m/${params.restaurantId}`);
}

