import { searchCards, getTcgGames } from "@/actions/cards";
import { CardList } from "./card-list";

export default async function CardsPage(props: {
  searchParams: Promise<{ q?: string; game?: string; set?: string; page?: string }>;
}) {
  const searchParams = await props.searchParams;
  const [result, games] = await Promise.all([
    searchCards({
      query: searchParams.q,
      tcgGameId: searchParams.game,
      setCode: searchParams.set,
      page: searchParams.page ? parseInt(searchParams.page) : 1,
    }),
    getTcgGames(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">カードDB</h1>
      </div>
      <CardList
        cards={result.cards}
        total={result.total}
        page={result.page}
        perPage={result.perPage}
        games={games}
        currentQuery={searchParams.q}
        currentGame={searchParams.game}
      />
    </div>
  );
}
