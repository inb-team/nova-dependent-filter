import Filter from './components/Filter'

Nova.booting((app, store) => {
  app.component('select-depends-filter', Filter)
})
