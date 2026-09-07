import type { FastifyInstance } from 'fastify';
import { getPersonTitles, getMoviesTitles } from '../db/queries.js';
import { normalizeLanguage } from '../services/languages.js';
import { config } from '../config.js';

interface PersonParams {
  personId: string;
}

interface PersonQuery {
  lang?: string;
  /** Şeritten çıkarılacak başlık — kullanıcının hâlihazırda baktığı yapım.
   *  Zorunlu değil: kişi başka bir bağlamdan da açılabilir. */
  exclude?: string;
}

interface TitleCard {
  id: number;
  title: string;
  year: number;
  posterUrl: string | null;
}

interface PersonResponse {
  name: string;
  profileUrl: string | null;
  titles: TitleCard[];
}

/**
 * Bir oyuncunun kütüphanedeki diğer yapımları.
 *
 * `/movies/:id/extras` içine konmadı, çünkü o uç bir **başlığın** yan
 * verilerini döndürüyor ve detay ekranı açılır açılmaz çağrılıyor. Kişi
 * listesi ise ancak kullanıcı bir portreye dokunduğunda gerekiyor; sekiz
 * oyuncunun sekiz filmografisini her açılışta taşımak, hiç açılmayacak bir
 * sayfanın maliyetini herkese ödetirdi. Aynı tembel yükleme gerekçesi
 * `extras.ts`'in başında da yazıyor.
 *
 * TMDB'nin `/person/{id}` ucuna gidilmiyor: soru "kütüphanemizde bu kişiden
 * başka ne var" ve cevabı kendi tablomuzda. Dışarıdan gelen bir filmografi,
 * kullanıcıya dokunamayacağı başlıklar gösterirdi.
 */
export async function peopleRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{
    Params: PersonParams;
    Querystring: PersonQuery;
    Reply: PersonResponse | { error: string };
  }>('/people/:personId/titles', async (request, reply) => {
    const personId = parseInt(request.params.personId, 10);
    if (isNaN(personId) || personId <= 0) {
      return reply.status(400).send({ error: 'Invalid person ID' });
    }

    const excludeId = parseInt(request.query.exclude ?? '', 10);
    const language = normalizeLanguage(request.query.lang);

    try {
      const person = await getPersonTitles(
        personId,
        Number.isInteger(excludeId) && excludeId > 0 ? excludeId : 0
      );
      if (!person) {
        return { name: '', profileUrl: null, titles: [] };
      }

      // Başlıklar kullanıcının dilinde: ekranın geri kalanı Türkçe başlık
      // gösterirken bu listenin İngilizce kalması tutarsız olurdu.
      const titles = await getMoviesTitles(
        person.titles.map((t) => t.id),
        language
      );

      return {
        name: person.name,
        profileUrl: person.profilePath
          ? `${config.tmdbProfileBaseUrl}${person.profilePath}`
          : null,
        titles: person.titles.map((t) => ({
          id: t.id,
          title: titles.get(t.id) ?? t.title,
          year: t.year,
          posterUrl: t.posterPath ? `${config.tmdbImageBaseUrl}${t.posterPath}` : null,
        })),
      };
    } catch (error) {
      request.log.error(error, 'Person titles fetch failed');
      return reply.status(500).send({ error: 'Failed to fetch person titles.' });
    }
  });
}
