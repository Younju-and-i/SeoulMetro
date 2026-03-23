import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import { BrowserRouter, Routes, Route } from "react-router";
// import Home from '@pages/home.jsx'
import Map from '@pages/map.jsx'
import '@styles/App.css';


const NotFound = () => {
  return (
    <div className="text-center">
      <h1>404</h1>
      <p>페이지를 찾을 수 없습니다.</p>
    </div>
  )
}


const App = () => {
  const paths = [
    // {path: "/", element: <Home />},
    {path: "/", element: <Map />},
    {path: "*", element: <NotFound />},
  ]
  return (
    <>
      <BrowserRouter>
        <Routes>
          { paths?.map((v, i) => <Route key={i} path={v.path} element={v.element} />) }
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App