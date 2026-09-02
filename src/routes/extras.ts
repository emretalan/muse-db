import type { FastifyInstance } from 'fastify';
import {
  getCollectionSiblings,
  getMovieCast,
  getMoviesTitles,
  getSameDirector,
  getSimilarTitles,
} from '../db/queries.js';
import type { CastMember } from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import { config } from '../config.js';

interface ExtrasParams {
  id: string;
}

interface ExtrasQuery {
  lang?: string;
}

interface PersonCard {
  name: string;
  character: string | null;
  profileUrl: string | null;
}

interface TitleCard {
  id: number;
  title: string;
  year: number;
  posterUrl: string | null;
}

interface ExtrasResponse {
  cast: PersonCard[];
  collection: { name: string; films: TitleCard[] } | null;
  /** Aynı yönetmenin diğer yapımları. `names` şerit başlığı için — bir
   *  filmin birden fazla yönetmeni olabiliyor. */
  director: { names: string[]; films: TitleCard[] } | null;
  similar: TitleCard[];
}

/**
 * Detay ekranının alt yarısı: kadro, seri ve benzerler.
 *
 * Üçü tek uçta, çünkü hepsi aynı ekranın aynı anda ihtiyaç duyduğu şey. Ayrı
 * uçlar detay ekranını beş eşzamanlı isteğe çıkarırdı (özet, sağlayıcılar,
 * fragman zaten var).
 *
 * `Movie` nesnesine gömülmemelerinin sebebi ise boyut: aday listesi otuz film
 * döndürüyor ve otuzunun kadrosunu taşımak, yalnızca birinin kadrosu için
 * ~15 KB fazladan demek. Tembel yükleme burada doğru desen.
 */
export async function extrasRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: ExtrasParams;
    Querystring: ExtrasQuery;
    Reply: ExtrasResponse | { error: string };
  }>('/movies/:id/extras', async (request, reply) => {
    const id = parseInt(request.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return reply.status(400).send({ error: 'Invalid movie ID' });
    }

    const language = normalizeLanguage(request.query.lang);

    try {
      const [cast, collection, director, similar] = await Promise.all([
        getMovieCast(id),
        getCollectionSiblings(id),
        getSameDirector(id),
        getSimilarTitles(id),
      ]);

      // Seri ve benzerler de kullanıcının dilinde: ekranın geri kalanı Türkçe
      // başlık gösterirken bu iki listenin İngilizce kalması tutarsız olurdu.
      const relatedIds = [
        ...(collection?.films.map((f) => f.id) ?? []),
        ...(director?.films.map((f) => f.id) ?? []),
        ...similar.map((s) => s.id),
      ];
      const titles = await getMoviesTitles(relatedIds, language);

      const card = (row: { id: number; title: string; year: number; posterPath: string | null }): TitleCard => ({
        id: row.id,
        title: titles.get(row.id) ?? row.title,
        year: row.year,
        posterUrl: row.posterPath ? `${config.tmdbImageBaseUrl}${row.posterPath}` : null,
      });

      return {
        cast: cast.map((person: CastMember) => ({
          name: person.name,
          character: person.character,
          // Oyuncu portreleri afişten küçük; w500 gereksiz büyük olurdu ve
          // sekiz portre yan yana duruyor.
          profileUrl: person.profilePath
            ? `${config.tmdbProfileBaseUrl}${person.profilePath}`
            : null,
        })),
        collection: collection
          ? { name: collection.name, films: collection.films.map(card) }
          : null,
        director: director
          ? { names: director.names, films: director.films.map(card) }
          : null,
        similar: similar.map(card),
      };
    } catch (error) {
      request.log.error(error, 'Extras fetch failed');
      return reply.status(500).send({ error: 'Failed to fetch extras.' });
    }
  });
}
