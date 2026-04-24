import express from 'express';
import path from 'path';
import cors from 'cors';
import moviesRouter from './api/movies-express';

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.use('/api/movies', moviesRouter);

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server: http://localhost:${PORT}`);
});
