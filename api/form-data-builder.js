class FormDataBuilder {
  static buildSearchForm() {
    const formData = new URLSearchParams();
    formData.append('tx_criticde_pi5[ovsearch_cinema]', '');
    formData.append('tx_criticde_pi5[ovsearch_cinema_show]', '');
    formData.append('ovsearch_movie_ajax', '');
    formData.append('tx_criticde_pi5[ovsearch_movie]', '');
    formData.append('tx_criticde_pi5[ovsearch_district]', '');
    formData.append('tx_criticde_pi5[ovsearch_date]', '');
    formData.append('tx_criticde_pi5[ovsearch_of]', '1');
    formData.append('tx_criticde_pi5[ovsearch_omu]', '1');
    formData.append('tx_criticde_pi5[submit_button]', 'search');
    formData.append('tx_criticde_pi5[submit]', '');
    formData.append('tx_criticde_pi5[ovsearch_days]', '');
    return formData;
  }
}

module.exports = FormDataBuilder;
